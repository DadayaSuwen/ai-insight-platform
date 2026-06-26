import { Injectable, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { AiService } from "../ai/ai.service";
import { ChatSessionService } from "./chat-session.service";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly sessionService: ChatSessionService,
  ) {}

  processMessageStream(
    sessionId: string,
    message: string,
  ): Observable<MessageEvent> {
    this.logger.log(`SSE stream start for session ${sessionId}: ${message}`);

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          // 1. 先拉历史（不含当前用户消息），保证 planner 看到的 history 是"过去"
          const history =
            await this.sessionService.getMessagesBySessionId(sessionId);
          const historyMessages = this.buildHistoryMessages(history);

          // 2. 再保存当前用户消息
          await this.sessionService.saveMessage(sessionId, "user", message);

          // 3. 定义收集器，用于保存最终的助手消息
          let assistantText = "";
          let assistantThinking = ""; // ★ 中间轮被丢弃的思考文字（不入 content）
          const assistantToolCalls: any[] = [];
          const assistantToolResults: any[] = [];
          // 配对 token：planner 严格按序发射 tool_call → tool_result，
          // 我们在 tool_call 时生成一个真 UUID 并暂存，tool_result 来时复用同一 id，
          // 这样 metadata 里能保存稳定的 {id, name, args/result} 三元组，
          // 重建时按 id 配对 AIMessage.tool_calls[].id 与 ToolMessage.tool_call_id，
          // 既不依赖下标（容忍未来并发/部分失败），UUID 也跨 turn 全局唯一。
          let pendingToolCallId: string | null = null;

          // 4. 消费 AiService 的流
          for await (const event of this.aiService.processStream(
            message,
            historyMessages,
          )) {
            subscriber.next({
              type: event.type,
              data: event.data,
            });

            // 收集助手的数据用于落库
            switch (event.type) {
              case "text":
                assistantText += event.data.content;
                break;
              case "thinking":
                // 中间轮被丢弃的文字（planner 已经决定调工具，所以这轮 text
                // 不会展示给用户，但保存到 metadata.thinking 供调试 / 未来
                // 加折叠面板用）。**不**写入 assistantText → 不污染多轮 LLM
                // 上下文。
                assistantThinking += event.data.content;
                break;
              case "tool_call":
                // 无论上游 provider 给什么 id，统一洗成 UUID，避免跨 turn 重复
                pendingToolCallId = randomUUID();
                assistantToolCalls.push({
                  id: pendingToolCallId,
                  ...event.data,
                });
                break;
              case "tool_result":
                // planner 的 try/catch 保证 tool_call 与 tool_result 严格配对，
                // 所以这里 pendingToolCallId 一定非空；万一缺失，做兜底
                assistantToolResults.push({
                  id: pendingToolCallId ?? randomUUID(),
                  ...event.data,
                });
                pendingToolCallId = null;
                break;
              // error / done 不需要收集
            }
          }

          // 5. 流结束后，保存助手消息
          await this.sessionService.saveMessage(
            sessionId,
            "assistant",
            assistantText,
            {
              toolCalls: assistantToolCalls,
              toolResults: assistantToolResults,
              // 仅当 thinking 非空时存，避免无意义字段
              ...(assistantThinking.length > 0
                ? { thinking: assistantThinking }
                : {}),
            },
          );

          // 5.5 touch 会话时间戳（让 sidebar 按 updatedAt 排序反映最新活动）
          await this.sessionService.touchSession(sessionId);

          // 6. 如果是第一句话，自动更新会话标题
          if (history.length <= 1 && message.length > 0) {
            const title =
              message.substring(0, 20) + (message.length > 20 ? "..." : "");
            await this.sessionService.updateSessionTitle(sessionId, title);
          }

          subscriber.complete();
        } catch (err: unknown) {
          this.logger.error(`SSE stream error: ${err}`);
          subscriber.next({
            type: "error",
            data: { code: "STREAM_FAILED", message: String(err) },
          });
          subscriber.next({ type: "done", data: {} });
          subscriber.complete();
        }
      })();
    });
  }

  // 将数据库记录转为 LangChain BaseMessage 数组
  private buildHistoryMessages(history: any[]): any[] {
    const messages: any[] = [];
    for (const record of history) {
      if (record.role === "user") {
        messages.push(new HumanMessage(record.content));
      } else if (record.role === "assistant") {
        // pg 驱动对 JSONB 列会自动解析为对象（Kysely 类型声明为 string 但运行时是 object）
        // 这里兼容两种形态：对象直接使用，字符串则 parse
        const rawMeta = record.metadata;
        const toolData =
          rawMeta == null
            ? null
            : typeof rawMeta === "string"
              ? JSON.parse(rawMeta)
              : rawMeta;

        // 如果有工具调用，先压入带 tool_calls 的 AIMessage
        if (toolData?.toolCalls?.length > 0) {
          const toolCalls = toolData.toolCalls as Array<{
            id: string;
            name: string;
            args: Record<string, any>;
          }>;
          const toolResults = (toolData.toolResults ?? []) as Array<{
            id: string | null;
            name: string;
            result: unknown;
          }>;

          // 直接复用保存时的 UUID —— 跨 turn 全局唯一，
          // 同一 turn 内多次调用同一工具也不会冲突。
          messages.push(
            new AIMessage({
              content: "",
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                args: tc.args,
                type: "tool_call",
              })),
            }),
          );

          // 按 saved id 配对 tool_call / tool_result，不依赖数组下标：
          // 1) 老数据可能没 id（fallback 跳过，不影响 LLM 校验）
          // 2) 即使未来 planner 改为并发执行，按 id 配对也不会错位
          for (const tr of toolResults) {
            if (!tr.id) continue;
            messages.push(
              new ToolMessage({
                tool_call_id: tr.id,
                name: tr.name,
                content: JSON.stringify(tr.result),
              }),
            );
          }
        }

        // 压入最终的文本回复
        if (record.content) {
          messages.push(new AIMessage(record.content));
        }
      }
    }
    return messages;
  }
}
