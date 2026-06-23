import { Controller, Sse, Query, MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * SSE stream endpoint.
   * GET /chat/stream?message=...
   * 直接透传 PlannerAgent 产生的所有事件 (tool_call, tool_result, text, error, done)。
   */
  @Sse("stream")
  stream(@Query("message") message: string): Observable<MessageEvent> {
    if (!message || typeof message !== "string") {
      return new Observable<MessageEvent>((subscriber) => {
        const errorData = {
          code: "INVALID_MESSAGE",
          message: "message query param is required",
        };
        // 直接使用字符串字面量，不再依赖旧枚举
        subscriber.next({ type: "error", data: errorData });
        subscriber.next({ type: "done", data: {} });
        subscriber.complete();
      });
    }

    return this.chatService.processMessageStream(message);
  }
}
