import {
  Controller,
  Sse,
  Query,
  MessageEvent,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, defer, finalize } from "rxjs";
import { ChatService } from "./chat.service";
import { runWithTrace, traceLogger } from "../ai/debug-log";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";

/**
 * [Sprint 2+5] SSE chat controller — 多租户
 *
 *   GET /chat/stream?message=...&sessionId=...   (Bearer)
 *
 * [Sprint 5] @UseGuards(JwtAuthGuard) — 把 currentUser 透传到 ChatService
 * 保证 SessionService.getSessionById(sessionId, userId) 越权 → NotFound。
 *
 * [Fix-3 Task 3.1] @UseGuards(JwtAuthGuard, PermissionsGuard) + @Permissions(CHAT_QUERY)
 */
@Controller("chat")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Sse("stream")
  @Permissions(PERMISSIONS.CHAT_QUERY)
  stream(
    @Query("message") message: string,
    @Query("sessionId") sessionId: string,
    @CurrentUser() user: { sub: string },
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
      req.on("close", () => controller.abort());
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
          return this.chatService.processMessageStream(
            sessionId,
            user.sub, // [Sprint 5]
            message,
            { signal: controller.signal },
          );
        },
      );
    }).pipe(finalize(() => req.removeAllListeners("close")));
  }
}