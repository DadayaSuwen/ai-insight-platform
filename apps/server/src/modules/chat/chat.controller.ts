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
  stream(
    @Query("message") message: string,
    @Query("sessionId") sessionId: string, // ★ 新增
  ): Observable<MessageEvent> {
    if (!message || !sessionId) {
      return new Observable<MessageEvent>((subscriber) => {
        subscriber.next({
          type: "error",
          data: { code: "INVALID_PARAMS", message: "参数缺失" },
        });
        subscriber.next({ type: "done", data: {} });
        subscriber.complete();
      });
    }
    return this.chatService.processMessageStream(sessionId, message);
  }
}
