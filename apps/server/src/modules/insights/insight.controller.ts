import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../database/database.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";
import { InsightSchedulerService } from "./insight-scheduler.service";

/**
 * [Sprint 6] Insight 端点
 *
 * GET    /api/insights                → 列表 (按 range 过滤)
 * GET    /api/insights/:id            → 详情
 * POST   /api/insights/:id/dismiss    → 标记已处理
 * POST   /api/insights/:id/shield     → 屏蔽此类
 * POST   /api/insights/run-now        → 手动触发巡检
 */

const ListQuerySchema = z.object({
  datasourceId: z.string().optional(),
  range: z.enum(["today", "week", "month", "all"]).default("all"),
});

const DismissSchema = z.object({
  id: z.string().min(1),
});

@Controller("api/insights")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsightController {
  constructor(
    private readonly db: DatabaseService,
    private readonly scheduler: InsightSchedulerService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.VIEW_INSIGHTS)
  async list(
    @Query() q: Record<string, string>,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = ListQuerySchema.parse(q);
    const cutoff = this.computeCutoff(parsed.range);

    let query = this.db.db
      .selectFrom("Insight")
      .selectAll()
      .orderBy("detectedAt", "desc");

    if (parsed.datasourceId) {
      query = query.where("datasourceId", "=", parsed.datasourceId);
    }
    if (cutoff) {
      query = query.where("detectedAt", ">=", cutoff);
    }

    const items = await query.limit(100).execute();
    return { success: true, data: items };
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    const item = await this.db.db
      .selectFrom("Insight")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!item) throw new NotFoundException("Insight not found");
    return { success: true, data: item };
  }

  @Post(":id/dismiss")
  async dismiss(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    await this.db.db
      .updateTable("Insight")
      .set({ status: "handled", handledAt: new Date() })
      .where("id", "=", id)
      .execute();
    return { success: true };
  }

  @Post(":id/shield")
  async shield(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    // 简化: shield 把 severity 标记为 low (实际生产应维护屏蔽表)
    await this.db.db
      .updateTable("Insight")
      .set({ severity: "low" })
      .where("id", "=", id)
      .execute();
    return { success: true };
  }

  @Post("run-now")
  async runNow(
    @Query("datasourceId") datasourceId: string | undefined,
    @CurrentUser() user: { sub: string },
  ) {
    if (datasourceId) {
      const log = await this.scheduler.runForDataSource(datasourceId, user.sub);
      return { success: true, data: log };
    }
    const logs = await this.scheduler.runAll();
    return { success: true, data: logs };
  }

  private computeCutoff(range: "today" | "week" | "month" | "all"): Date | null {
    if (range === "all") return null;
    const now = new Date();
    if (range === "today") {
      now.setHours(0, 0, 0, 0);
      return now;
    }
    if (range === "week") {
      now.setDate(now.getDate() - 7);
      return now;
    }
    if (range === "month") {
      now.setMonth(now.getMonth() - 1);
      return now;
    }
    return null;
  }
}
