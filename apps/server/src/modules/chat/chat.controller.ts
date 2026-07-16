import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { runWithTrace, traceLogger } from "../ai/debug-log";
import { ChatService } from "./chat.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";

/**
 * [Sprint 2+5] SSE chat controller — 多租户
 *
 *   POST /chat/stream  { message, sessionId }   (Bearer)
 *
 * [BUG-005] 改为 POST + body 传参，避免长消息 URL 414
 */
@Controller("chat")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("stream")
  @HttpCode(200)
  @Permissions(PERMISSIONS.CHAT_QUERY)
  async stream(
    @Body() body: { message: string; sessionId: string },
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { message, sessionId } = body || {};
    if (!message || !sessionId) {
      res.status(400).json({ success: false, error: { code: "INVALID_PARAMS", message: "参数缺失" } });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const traceId = (req as any).traceId ?? "no-trace";
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      const observable = runWithTrace(
        { traceId, sessionId, userMessage: message.slice(0, 200), startTs: Date.now() },
        () => {
          traceLogger.trace({ phase: "controller-entry", ctx: { sessionId, messageLen: message.length }, level: "log" });
          return this.chatService.processMessageStream(sessionId, user.sub, message, { signal: controller.signal });
        },
      );

      observable.subscribe({
        next: (evt: any) => {
          res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
        },
        complete: () => res.end(),
        error: (err: any) => {
          res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || String(err) })}\n\n`);
          res.end();
        },
      });
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      res.end();
    }
  }
}