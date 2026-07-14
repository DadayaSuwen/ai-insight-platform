import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Sse,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { z } from "zod";
import { ReviewService } from "./review.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";

/**
 * [Sprint 6] Schema 纠错对话端点
 *
 * POST /api/schema/review/start         → 开始纠错
 * GET  /api/schema/review/chat          → SSE 流式纠错对话 (query: reviewId + message)
 * POST /api/schema/review/finalize      → 敲定 Schema
 */

const StartSchema = z.object({
  datasourceId: z.string().min(1),
});

const FinalizeSchema = z.object({
  reviewId: z.string().min(1),
});

@Controller("api/schema/review")
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post("start")
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
   * GET /api/schema/review/chat?reviewId=xxx&message=xxx
   *
   * SSE Events:
   *   ai_thinking   — Agent 正在理解回答
   *   field_updated — 字段确认结果 {table, field, chineseName, role}
   *   next_question — 下一个提问 {question, fieldName, quickReplies, remaining}
   *   done          — {remaining, allConfirmed}
   */
  @Sse("chat")
  chat(
    @Query("reviewId") reviewId: string,
    @Query("message") message: string,
  ): Observable<{ type: string; data: unknown }> {
    if (!reviewId || !message) {
      throw new BadRequestException("reviewId and message are required");
    }

    return new Observable((subscriber) => {
      void (async () => {
        try {
          // Step 1: 处理用户回答
          subscriber.next({
            type: "ai_thinking",
            data: { content: "正在理解你的回答..." },
          } as unknown as { type: string; data: unknown });

          const processed = await this.reviewService.processAnswer(
            reviewId,
            message,
          );

          if (processed.updated) {
            subscriber.next({
              type: "field_updated",
              data: {
                table: processed.updated.table,
                field: processed.updated.field,
                chineseName: processed.updated.chineseName,
                role: processed.updated.role,
              },
            } as unknown as { type: string; data: unknown });
          }

          // Step 2: 生成下一个提问
          if (processed.remaining > 0) {
            const next = await this.reviewService.generateQuestion(reviewId);
            if (next) {
              subscriber.next({
                type: "next_question",
                data: {
                  question: next.question,
                  fieldName: next.fieldName,
                  tableName: next.tableName,
                  quickReplies: next.quickReplies,
                  evidence: next.evidence,
                  remaining: next.remaining,
                },
              } as unknown as { type: string; data: unknown });
            }
          }

          // Step 3: 完成
          subscriber.next({
            type: "done",
            data: {
              remaining: processed.remaining,
              allConfirmed: processed.remaining === 0,
            },
          } as unknown as { type: string; data: unknown });
        } catch (err) {
          subscriber.next({
            type: "error",
            data: { message: (err as Error).message },
          } as unknown as { type: string; data: unknown });
        }
        subscriber.complete();
      })();
    });
  }

  @Post("finalize")
  async finalize(@Body() body: unknown) {
    const parsed = FinalizeSchema.parse(body);
    const result = await this.reviewService.finalizeReview(parsed.reviewId);
    return { success: true, data: result };
  }
}
