import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { z } from "zod";
import { DashboardGeneratorService } from "./generator.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/auth.decorators";
import { DatasourceService } from "../datasource/datasource.service";
import { ExecutorFactory } from "../datasource/executors/executor.factory";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { Permissions } from "../rbac/permissions.decorator";
import { PERMISSIONS } from "../rbac/permissions";

/**
 * [Sprint 6 / Fix-2 Task 2.1] 工作台生成 + 获取 + 数据执行
 *
 * POST /api/dashboard/generate      → 生成工作台配置 (LLM)
 * GET  /api/dashboard/:datasourceId  → 获取已生成的工作台
 * POST /api/dashboard/execute       → 执行 kpi/chart 的 SQL, 返回真实数据行
 *
 * execute 用于前端 DynamicChart 真实渲染 (替代 ChartPlaceholder)
 */

const GenerateSchema = z.object({
  datasourceId: z.string().min(1),
});

/**
 * [Fix-2 Task 2.1] execute 入参: 单条 kpi 或 chart 的"安全 SQL 执行请求"
 * - table: 表名 (白名单 ASCII)
 * - metric: 列名/聚合表达式 (白名单 ASCII + SUM/COUNT/AVG/MIN/MAX)
 * - groupBy: 可选, 列名 (白名单 ASCII)
 * - timeField: 可选, 时间字段 (白名单 ASCII)
 * - range: 可选, 时间范围 (e.g. "30d" / "12m"), 缺省 30d
 * - limit: 可选, 行数限制 (1-1000, 缺省 1000)
 */
const ExecuteSchema = z.object({
  datasourceId: z.string().min(1),
  table: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "table 必须是安全标识符"),
  metric: z.string().min(1).max(120),
  groupBy: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
  timeField: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
  range: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

// [Fix-5 Task 5.11] 放宽 metric 白名单: 允许中文 + 空格 (Fix-1 之后 LLM 可输出中文列名),
// 拒绝 SQL 注入特殊字符 (单引号/分号/连字符/括号等)
const SAFE_METRIC = /^[A-Za-z_一-龥][A-Za-z0-9_一-龥\s]*$/;
const AGG_METRIC = /^(SUM|COUNT|AVG|MIN|MAX)\([A-Za-z_*][A-Za-z0-9_]*\)$/i;

@Controller("api/dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardGeneratorController {
  private readonly logger = new Logger(DashboardGeneratorController.name);

  constructor(
    private readonly generator: DashboardGeneratorService,
    private readonly datasourceService: DatasourceService,
    private readonly executorFactory: ExecutorFactory,
  ) {}

  @Post("generate")
  @Permissions(PERMISSIONS.VIEW_DASHBOARD)
  async generate(
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = GenerateSchema.parse(body);
    const config = await this.generator.generate(parsed.datasourceId, user.sub);
    return { success: true, data: config };
  }

  @Get(":datasourceId")
  async get(
    @Param("datasourceId") datasourceId: string,
    @CurrentUser() user: { sub: string },
  ) {
    const config = await this.generator.getConfig(datasourceId, user.sub);
    if (!config) {
      throw new NotFoundException("Dashboard not found. Run generate first.");
    }
    return { success: true, data: config };
  }

  /**
   * [Fix-2 Task 2.1] 数据执行: 把 dashboard kpi/chart 翻译成安全 SQL 并跑
   *
   * 流程: 1) 校验 metric/table 白名单  2) 调 executor.executeRaw  3) 兜底返回空数组
   * 安全: 所有 identifier 经过严格正则, 不接受任何用户输入拼到 SQL 中
   */
  @Post("execute")
  @Permissions(PERMISSIONS.VIEW_DASHBOARD)
  async execute(
    @Body() body: unknown,
    @CurrentUser() user: { sub: string },
  ) {
    const parsed = ExecuteSchema.parse(body);

    // 校验 metric: 单列名 / 聚合表达式
    let metricExpr: string;
    if (SAFE_METRIC.test(parsed.metric)) {
      // 默认按 SUM 聚合 measure 字段
      metricExpr = `SUM("${parsed.metric}")`;
    } else if (AGG_METRIC.test(parsed.metric)) {
      metricExpr = parsed.metric;
    } else {
      throw new NotFoundException("Unsafe metric expression");
    }

    // ownership 校验
    const ds = await this.datasourceService.getByIdForUser(
      parsed.datasourceId,
      user.sub,
    );
    if (!ds) throw new NotFoundException("DataSource not found");

    // range 解析 (默认 30d, 支持 7d/30d/90d/12m)
    const rangeDays = this.parseRangeDays(parsed.range);

    // 构造 SQL: 有 groupBy 用 group, 没 groupBy 用整体聚合
    let sql: string;
    if (parsed.groupBy) {
      const timeFilter = parsed.timeField
        ? `WHERE "${parsed.timeField}" >= NOW() - INTERVAL '${rangeDays} days'`
        : "";
      sql = `SELECT "${parsed.groupBy}" as name, ${metricExpr} as value
             FROM "${parsed.table}"
             ${timeFilter}
             GROUP BY "${parsed.groupBy}"
             ORDER BY value DESC
             LIMIT ${parsed.limit ?? 1000}`;
    } else if (parsed.timeField) {
      // 时序聚合: 按天分组
      sql = `SELECT date_trunc('day', "${parsed.timeField}") as time, ${metricExpr} as value
             FROM "${parsed.table}"
             WHERE "${parsed.timeField}" >= NOW() - INTERVAL '${rangeDays} days'
             GROUP BY time
             ORDER BY time
             LIMIT ${parsed.limit ?? 1000}`;
    } else {
      // 整体聚合 (kpi 用)
      sql = `SELECT ${metricExpr} as value
             FROM "${parsed.table}"
             LIMIT 1`;
    }

    try {
      const config = this.datasourceService.decryptConfigForExecutor(
        ds.connectionConfig as unknown as Parameters<ExecutorFactory["create"]>[1],
      );
      const executor = this.executorFactory.create(parsed.datasourceId, config);
      const result = await executor.executeRaw(sql);
      try {
        await executor.dispose();
      } catch {
        // 忽略 dispose 失败
      }
      return { success: true, data: { rows: result.rows, sql } };
    } catch (err) {
      this.logger.warn(
        `dashboard/execute failed for ${parsed.datasourceId}: ${(err as Error).message}`,
      );
      // 失败时返回空 rows (前端降级显示空图表)
      return { success: true, data: { rows: [], sql, error: (err as Error).message } };
    }
  }

  private parseRangeDays(range?: string): number {
    if (!range) return 30;
    const m = /^(\d+)([dhm])$/.exec(range);
    if (!m) return 30;
    const n = Number(m[1]);
    const unit = m[2];
    if (unit === "d") return n;
    if (unit === "m") return n * 30;
    if (unit === "h") return Math.max(1, Math.ceil(n / 24));
    return 30;
  }
}
