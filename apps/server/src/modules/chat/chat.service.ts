import { Injectable, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { AiService } from "../ai/ai.service";

/**
 * ChatService - Chat streaming orchestration
 *
 * 在 Agent 架构下，它的唯一职责是将 AiService 的 AsyncGenerator
 * 转换为 NestJS 的 SSE Observable 流，并直接透传所有事件。
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * True SSE stream — 直接透传 AiService 产生的事件。
   */
  processMessageStream(message: string): Observable<MessageEvent> {
    this.logger.log(`SSE stream start: ${message}`);

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          // 消费 AiService 的异步迭代器
          for await (const event of this.aiService.processStream(message)) {
            // 直接透传事件的 type 和 data，不做任何拦截和修改
            subscriber.next({
              type: event.type, // "tool_call" | "tool_result" | "text" | "error" | "done"
              data: event.data,
            });
          }
          subscriber.complete();
        } catch (err: unknown) {
          this.logger.error(`SSE stream error: ${err}`);
          const errorData = {
            code: "STREAM_FAILED",
            message: err instanceof Error ? err.message : String(err),
          };
          subscriber.next({ type: "error", data: errorData });
          subscriber.next({ type: "done", data: {} });
          subscriber.complete();
        }
      })();
    });
  }
}
