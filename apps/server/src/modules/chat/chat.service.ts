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
    opts: { signal?: AbortSignal } = {},
  ): Observable<MessageEvent> {
    this.logger.log(`SSE stream start for session ${sessionId}: ${message}`);

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        // 收集器声明在 try 之外，让 catch 块能访问 partial 文本
        let assistantText = "";
        const assistantToolCalls: any[] = [];
        const assistantToolResults: any[] = [];

        try {
          // 1. 先拉历史（不含当前用户消息），保证 planner 看到的 history 是"过去"
          const history =
            await this.sessionService.getMessagesBySessionId(sessionId);
          const historyMessages = this.buildHistoryMessages(history);

          // 2. 再保存当前用户消息
          await this.sessionService.saveMessage(sessionId, "user", message);

          // 3. 消费 AiService 的流（收集器已在 try 外声明）
          for await (const event of this.aiService.processStream(
            message,
            historyMessages,
            { signal: opts.signal, sessionId },
          )) {
            subscriber.next({
              type: event.type,
              data: event.data,
            });

            // 用 exhaustive switch 替 if/else if（TS 通过 PlannerStreamEvent
            // union 自动 narrow 每个 case 的 event.data 类型）。
            // planner.agent.ts 已经在 tool_call / tool_result data 里给好 id，
            // chat 层直接 push 即可，不再需要 randomUUID 兜底。
            switch (event.type) {
              case "text":
                assistantText += event.data.content;
                break;
              case "tool_call":
                assistantToolCalls.push(event.data);
                break;
              case "tool_result":
                assistantToolResults.push(event.data);
                break;
              case "error":
              case "done":
              case "thinking":
                // 不需要收集的状态事件，nothing to do
                break;
            }
          }

          // 4. 流结束后，保存助手消息
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
          // returningAll() 直接拿到更新后的整行，避免再 SELECT 一次
          let finalSession = await this.sessionService.touchSession(sessionId);

          // 6. 如果是第一句话，自动更新会话标题（如果重命名了，finalSession 用新行）
          if (history.length <= 1 && message.length > 0) {
            const title =
              message.substring(0, 20) + (message.length > 20 ? "..." : "");
            const renamed = await this.sessionService.updateSessionTitle(
              sessionId,
              title,
            );
            if (renamed) finalSession = renamed;
          }

          // 7. 成功路径显式发 done 事件，把最新 session 一起回给前端，
          //    前端用 upsertSession 局部更新侧栏，省一次 GET /chat/sessions
          subscriber.next({
            type: "done",
            data: { session: finalSession ?? null },
          });
          subscriber.complete();
        } catch (err: unknown) {
          this.logger.error(`SSE stream error: ${err}`);
          // 流意外中断时保存已生成的 partial 文本，让用户能看到 LLM 想了什么。
          // 用独立 try/catch 包住 save，避免 save 失败时再次触发本 catch。
          if (assistantText.trim().length > 0) {
            try {
              await this.sessionService.saveMessage(
                sessionId,
                "assistant",
                assistantText + "\n\n[stream interrupted]",
                {
                  toolCalls: assistantToolCalls,
                  toolResults: assistantToolResults,
                },
              );
              await this.sessionService.touchSession(sessionId);
            } catch (saveErr) {
              this.logger.error(
                `Failed to save partial assistant text: ${saveErr}`,
              );
            }
          }
          subscriber.next({
            type: "error",
            data: { code: "STREAM_FAILED", message: String(err) },
          });
          // session: null 让前端 fallback 到 refreshSessions() 兜底刷新侧栏
          subscriber.next({ type: "done", data: { session: null } });
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

        // ★ Qwen3 / DeepSeek-R1 多轮对话需要回传 reasoning_content
        // 从 metadata.reasoning 字段读取（planner 在聊天过程中通过
        // assistantReasoning collector 收集并保存）。
        const reasoningContent: string | undefined =
          toolData?.reasoning &&
          typeof toolData.reasoning === "string" &&
          toolData.reasoning.length > 0
            ? toolData.reasoning
            : undefined;
        const additionalKwargs = reasoningContent
          ? { reasoning_content: reasoningContent }
          : {};

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
          // ★ 同时附加 reasoning_content（Qwen3 API 校验必需）
          messages.push(
            new AIMessage({
              content: "",
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                args: tc.args,
                type: "tool_call",
              })),
              additional_kwargs: additionalKwargs,
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

        // 压入最终的文本回复（AIMessage 也带 reasoning_content 给 Qwen3）
        if (record.content) {
          messages.push(
            new AIMessage({
              content: record.content,
              additional_kwargs: additionalKwargs,
            }),
          );
        }
      }
    }
    return messages;
  }
}
