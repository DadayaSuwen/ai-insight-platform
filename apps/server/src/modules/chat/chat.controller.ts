import { Controller, Sse, Query, MessageEvent, Req } from "@nestjs/common";
import type { Request } from "express";
import { Observable, defer, finalize } from "rxjs";
import { ChatService } from "./chat.service";
import { runWithTrace, traceLogger } from "../ai/debug-log";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * SSE stream endpoint.
   * GET /chat/stream?message=...&sessionId=...
   *
   * 用 RxJS defer 把 AbortController 创建延迟到订阅时；监听 req.on("close")
   * （客户端断开 / Stop 按钮 / 浏览器关闭）→ abort → 透传到 planner/agent →
   * LangChain ChatOllama 真正中断 HTTP 请求。
   *
   * [M7] SSE 入口用 runWithTrace 注入 traceId/sessionId/userMessage,
   *      AsyncLocalStorage 跨 async 上下文自动传递,所有 traceLogger.trace 调用都带 traceId
   */
  @Sse("stream")
  stream(
    @Query("message") message: string,
    @Query("sessionId") sessionId: string,
    @Req() req: Request,
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

    const traceId =
      (req as Request & { traceId?: string }).traceId ?? "no-trace";

    return defer(() => {
      const controller = new AbortController();
      // 客户端断开（Stop / 浏览器关闭 / 网络断）→ 立即 abort
      req.on("close", () => controller.abort());
      // [M7] 整个 SSE stream 都在 AsyncLocalStorage 上下文中
      return runWithTrace(
        {
          traceId,
          sessionId,
          userMessage: message.slice(0, 200),
          startTs: Date.now(),
        },
        () => {
          traceLogger.trace({
            phase: "controller-entry",
            ctx: { sessionId, messageLen: message.length },
            level: "log",
          });
          return this.chatService.processMessageStream(sessionId, message, {
            signal: controller.signal,
          });
        },
      );
    }).pipe(
      // 兜底：Observable 终止时确保不再持有 req 监听器，防止内存泄漏
      finalize(() => req.removeAllListeners("close")),
    );
  }
}