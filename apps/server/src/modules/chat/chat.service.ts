import { Injectable, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
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
          // 1. 保存用户消息
          await this.sessionService.saveMessage(sessionId, "user", message);

          // 2. 拉取历史记忆
          const history =
            await this.sessionService.getMessagesBySessionId(sessionId);
          const historyMessages = this.buildHistoryMessages(history);

          // 3. 定义收集器，用于保存最终的助手消息
          let assistantText = "";
          const assistantToolCalls: any[] = [];
          const assistantToolResults: any[] = [];

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
            if (event.type === "text") {
              assistantText += (event.data as any).content;
            } else if (event.type === "tool_call") {
              assistantToolCalls.push(event.data);
            } else if (event.type === "tool_result") {
              assistantToolResults.push(event.data);
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
          messages.push(
            new AIMessage({
              content: "",
              tool_calls: toolData.toolCalls.map((tc: any) => ({
                id: tc.name, // 与 planner.agent.ts 中 toolCall.id 保持一致
                name: tc.name,
                args: tc.args,
                type: "tool_call",
              })),
            }),
          );

          // 压入对应的 ToolMessage（必须用 LangChain 的类，序列化时会带 name 字段）
          for (const tr of toolData?.toolResults ?? []) {
            messages.push(
              new ToolMessage({
                tool_call_id: tr.name,
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
