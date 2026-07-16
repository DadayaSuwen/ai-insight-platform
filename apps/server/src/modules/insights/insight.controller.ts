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
import { DatasourceService } from "../datasource/datasource.service";
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
    private readonly datasourceService: DatasourceService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.VIEW_INSIGHTS)
  async list(
    @Query() q: Record<string, string>,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = ListQuerySchema.parse(q);
    const cutoff = this.computeCutoff(parsed.range);

    // [Fix-1 Task 1.8] ownership 过滤：list 必须按 user 拥有的数据源过滤
    // 不能让任意用户看到别人的 insights
    const ownedIds = await this.db.db
      .selectFrom("DataSource")
      .select("id")
      .where("userId", "=", user.sub)
      .execute();
    const ownedIdSet = new Set(ownedIds.map((d) => d.id));

    let query = this.db.db
      .selectFrom("Insight")
      .selectAll()
      .orderBy("detectedAt", "desc");

    if (parsed.datasourceId) {
      // 如果指定了 datasourceId, 必须先校验归属
      const ds = await this.datasourceService.getByIdForUser(
        parsed.datasourceId,
        user.sub,
      );
      if (!ds) throw new NotFoundException("DataSource not found");
      query = query.where("datasourceId", "=", parsed.datasourceId);
    } else {
      // 否则只列 user 拥有的数据源产生的 insights
      if (ownedIdSet.size === 0) return { success: true, data: [] };
      query = query.where("datasourceId", "in", Array.from(ownedIdSet));
    }
    if (cutoff) {
      query = query.where("detectedAt", ">=", cutoff);
    }

    const items = await query.limit(100).execute();
    return { success: true, data: items };
  }

  @Get("count")
  async count(
    @Query("datasourceId") datasourceId: string,
    @CurrentUser() user: { sub: string },
  ) {
    const ds = await this.datasourceService.getByIdForUser(
      datasourceId,
      user.sub,
    );
    if (!ds) throw new NotFoundException("DataSource not found");

    const result = await this.db.db
      .selectFrom("Insight")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("datasourceId", "=", datasourceId)
      .where("status", "=", "active")
      .executeTakeFirst();

    return {
      success: true,
      data: { count: Number(result?.count ?? 0) },
    };
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    const item = await this.db.db
      .selectFrom("Insight")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!item) throw new NotFoundException("Insight not found");
    // [Fix-1 Task 1.8] 校验归属
    const ds = await this.datasourceService.getByIdForUser(
      item.datasourceId as string,
      user.sub,
    );
    if (!ds) throw new NotFoundException("Insight not found or access denied");
    return { success: true, data: item };
  }

  @Post(":id/dismiss")
  async dismiss(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    // [Fix-1 Task 1.8] 先查 insight 拿到 datasourceId, 再校验归属
    const item = await this.db.db
      .selectFrom("Insight")
      .select(["datasourceId"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!item) throw new NotFoundException("Insight not found");
    const dsDismiss = await this.datasourceService.getByIdForUser(
      item.datasourceId as string,
      user.sub,
    );
    if (!dsDismiss) throw new NotFoundException("Insight not found or access denied");
    await this.db.db
      .updateTable("Insight")
      .set({ status: "handled", handledAt: new Date() })
      .where("id", "=", id)
      .execute();
    return { success: true };
  }

  @Post(":id/shield")
  async shield(@Param("id") id: string, @CurrentUser() user: { sub: string }) {
    // [Fix-1 Task 1.8] ownership 校验
    const item = await this.db.db
      .selectFrom("Insight")
      .select(["datasourceId"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!item) throw new NotFoundException("Insight not found");
    const dsShield = await this.datasourceService.getByIdForUser(
      item.datasourceId as string,
      user.sub,
    );
    if (!dsShield) throw new NotFoundException("Insight not found or access denied");
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
      const ds = await this.datasourceService.getByIdForUser(datasourceId, user.sub);
      if (!ds) throw new NotFoundException("DataSource not found or access denied");
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
