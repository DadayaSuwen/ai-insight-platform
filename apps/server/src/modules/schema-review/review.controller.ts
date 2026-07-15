import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  BadRequestException,
  Res,
  Req,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { ReviewService } from "./review.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";

/**
 * [Sprint 6 + Fix-3 Task 3.1] Schema 纠错对话端点
 *
 * POST /api/schema/review/start         → 开始纠错
 * POST /api/schema/review/chat          → SSE 流式纠错对话 { reviewId, message }
 * POST /api/schema/review/finalize      → 敲定 Schema
 */

const StartSchema = z.object({
  datasourceId: z.string().min(1),
});

const FinalizeSchema = z.object({
  reviewId: z.string().min(1),
});

@Controller("api/schema/review")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post("start")
  @Permissions(PERMISSIONS.SCHEMA_REVIEW)
  async start(@Body() body: unknown, @CurrentUser() user: { sub: string }) {
    const parsed = StartSchema.parse(body);
    const result = await this.reviewService.startReview(
      parsed.datasourceId,
      user.sub,
    );
    return { success: true, data: result };
  }

  /**
   * SSE 纠错对话
   *
   * POST /api/schema/review/chat  { reviewId, message }
   *
   * SSE Events:
   *   ai_thinking   — Agent 正在理解回答
   *   field_updated — 字段确认结果 {table, field, chineseName, role}
   *   next_question — 下一个提问 {question, fieldName, quickReplies, remaining}
   *   done          — {remaining, allConfirmed}
   */
  @Post("chat")
  @Permissions(PERMISSIONS.SCHEMA_REVIEW)
  async chat(
    @Body() body: { reviewId: string; message: string },
    @CurrentUser() user: { sub: string },
    @Res() res: Response,
  ) {
    const { reviewId, message } = body || {};
    if (!reviewId || !message) {
      res.status(400).json({ success: false, error: { message: "reviewId and message are required" } });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (type: string, data: unknown) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send("ai_thinking", { content: "正在理解你的回答..." });

      const processed = await this.reviewService.processAnswer(reviewId, message, user.sub);

      if (processed.updated) {
        send("field_updated", {
          table: processed.updated.table,
          field: processed.updated.field,
          chineseName: processed.updated.chineseName,
          role: processed.updated.role,
        });
      }

      if (processed.remaining > 0) {
        const next = await this.reviewService.generateQuestion(reviewId);
        if (next) {
          send("next_question", {
            question: next.question,
            fieldName: next.fieldName,
            tableName: next.tableName,
            quickReplies: next.quickReplies,
            evidence: next.evidence,
            remaining: next.remaining,
          });
        }
      }

      send("done", { remaining: processed.remaining, allConfirmed: processed.remaining === 0 });
    } catch (err) {
      send("error", { message: (err as Error).message });
    }
    res.end();
  }

  @Post("confirm-all")
  @Permissions(PERMISSIONS.SCHEMA_REVIEW)
  async confirmAll(@Body() body: unknown, @CurrentUser() user: { sub: string }) {
    const parsed = FinalizeSchema.parse(body); // reuses { reviewId }
    const result = await this.reviewService.confirmAllFields(parsed.reviewId, user.sub);
    return { success: true, data: result };
  }

  @Post("finalize")
  @Permissions(PERMISSIONS.SCHEMA_REVIEW)
  async finalize(@Body() body: unknown, @CurrentUser() user: { sub: string }) {
    const parsed = FinalizeSchema.parse(body);
    const result = await this.reviewService.finalizeReview(parsed.reviewId, user.sub);
    return { success: true, data: result };
  }
}
