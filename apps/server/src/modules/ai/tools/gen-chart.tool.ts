import { tool } from "@langchain/core/tools";
import { sql } from "kysely";
import { Logger } from "@nestjs/common";
import { GenChartArgsSchema, type ChartIntent } from "./schemas";
import { DatabaseService } from "../../database/database.service";
import { ChartHelper, ChartAssembleError } from "./chart.helper";
import { ChartAgent } from "../agents/chart.agent";
import {
  DIMENSION_BUILDERS,
  METRIC_SELECTORS,
  METRIC_LABELS,
  type QB,
  type MetricKey,
  type DimensionKey,
} from "./dimensions";
import { traceLogger } from "../debug-log";

/**
 * gen_chart 工具工厂 (V2 重构 — 意图驱动 + 确定性装配)
 *
 * [M13-V2] 新链路:
 *   1. SQL 聚合拿到 rows (M9 GUARD-4a/b 保留)
 *   2. chartAgent.extractIntent(rows, message, ctx) → ChartIntent (LLM 仅输出意图)
 *   3. chartHelper.assemble(intent, rows, ctx) → EChartsOption (代码 100% 装配)
 *   4. 返回 {chart, chartType, chartSource, metrics, metricLabels, groupBy, rows, intent}
 *
 * [GUARD-V2-2] 装配失败抛 ChartAssembleError → tool 返回 {error, rows, intent},
 *   前端 DynamicChart Canvas 像素探针触发 → ChartErrorBoundary 内联 CollapsibleTable
 */
export function createGenChartTool(
  db: DatabaseService,
  chartHelper: ChartHelper,
  chartAgent: ChartAgent,
) {
  const logger = new Logger("GenChartTool");
  return tool(
    async (
      input: import("zod").infer<typeof GenChartArgsSchema> & {
        // 由 Planner 注入的运行时上下文 (不来自 LLM args)
        originalMessage?: string;
        // [M6-L3] Planner 注入的 sessionId
        sessionId?: string;
      },
    ) => {
      const { region, category, timeRange, groupBy, chartType, metrics, topN } = input;
      const groupField = ((groupBy ?? "category") as DimensionKey);
      // [M9-Bug D] metrics:[] 兜底为 ["sales"]
      const metricList = (
        metrics && metrics.length > 0 ? metrics : ["sales"]
      ) as MetricKey[];

      try {
        const builder = DIMENSION_BUILDERS[groupField];
        if (!builder) {
          return { error: `Unsupported groupBy: ${groupBy}` };
        }

        // [GUARD-4a] 默认时间范围 (M9-Bug A 修复)
        let dateFilter: ReturnType<typeof sql> = sql<boolean>`1=1`;
        const now = new Date();
        const tRange = timeRange ?? null;
        if (tRange === "今天") {
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          dateFilter = sql`o."orderDate" >= ${startOfDay}`;
        } else if (tRange === "本月") {
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), now.getMonth(), 1)}`;
        } else if (tRange === "上月") {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter = sql<boolean>`o."orderDate" >= ${lastMonth} AND o."orderDate" < ${thisMonth}`;
        } else if (tRange === "今年") {
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), 0, 1)}`;
        }

        // 1. 基础查询 + 维度 join
        let qb: QB = db.db.selectFrom("SalesOrderItem as s");
        qb = builder.joins(qb);

        // 2. 应用 region/category filter
        if (region && region !== "全部") {
          qb = qb
            .innerJoin("SalesOrder as _o_r", "_o_r.id", "s.orderId")
            .innerJoin("Customer as _c_r", "_c_r.id", "_o_r.customerId");
          qb = qb.where("_c_r.region", "=", region);
        }
        if (category && category !== "全部") {
          qb = qb.innerJoin("Product as _p_c", "_p_c.id", "s.productId");
          qb = qb.where("_p_c.category", "=", category);
        }

        // 3. SELECT name + 多 metric
        qb = qb.select([
          builder.key.as("name"),
          ...metricList.map((m) => METRIC_SELECTORS[m].as(m)),
        ]);

        // 4. 应用 dateFilter
        qb = qb.where(dateFilter);

        // 5. GROUP BY
        if (groupField !== "none") {
          qb = qb.groupBy(builder.key);
        }

        // 6. 排序
        qb = qb.orderBy(METRIC_SELECTORS[metricList[0]] as any, "desc");

        // [GUARD-4b] LIMIT 保护
        const effectiveLimit =
          groupField === "none" ? 50 : Math.min(topN ?? 1000, 1000);
        qb = qb.limit(effectiveLimit);

        // SQL 计时
        const sqlStart = Date.now();
        const result = await qb.execute();
        traceLogger.trace({
          phase: "sql-execute",
          ctx: {
            groupField,
            metricList,
            region,
            category,
            tRange,
            ms: Date.now() - sqlStart,
            rowCount: result.length,
          },
          level: "log",
        });

        // 数据 shape
        const rows: Record<string, number | string>[] = result.map((r: any) => {
          const row: Record<string, number | string> = {
            name: String(r.name ?? ""),
          };
          for (const m of metricList) {
            row[m] =
              m === "discount"
                ? Number(Number(r[m] ?? 0).toFixed(4))
                : Number(r[m] ?? 0);
          }
          return row;
        });

        if (rows.length === 0) {
          return { error: "未查询到相关数据,无法生成图表" };
        }

        const metricLabels = metricList.reduce(
          (acc, m) => ({ ...acc, [m]: METRIC_LABELS[m] }),
          {} as Record<string, string>,
        );

        // [M13-V2] 阶段 2: 提取意图 (LLM 仅输出 ChartIntent)
        const contextMessage =
          input.originalMessage ?? `${groupField} ${chartType} chart`;
        const ctx = {
          chartTypeHint: chartType,
          groupBy: groupField,
          groupLabel: builder.label,
          metrics: metricList,
          metricLabels,
          sessionId: input.sessionId,
          originalMessage: input.originalMessage,
          // [M5-Patch-Fix] Planner 显式传的样式/地图/布局 → 注入 ctx,
          //   chartAgent.fillIntentFields() 会优先使用 explicit 值,不覆盖
          explicitColorPalette: input.colorPalette ?? null,
          explicitMapType: input.mapType ?? null,
          explicitLayout: input.layout ?? null,
        };
        const intent: ChartIntent = await chartAgent.extractIntent(
          rows,
          contextMessage,
          ctx,
        );

        // [M13-V2] 阶段 3: 确定性装配 (不 try/catch,失败由 ChartAssembleError 上抛)
        let chart: Record<string, unknown>;
        let chartSource: "agent" | "fallback" = "agent";
        try {
          chart = chartHelper.assemble(intent, rows, {
            groupLabel: builder.label,
          }) as Record<string, unknown>;
        } catch (assembleErr) {
          // [GUARD-V2-2] ChartAssembleError → trace + 返回 error + rows
          //   前端 Canvas 像素探针或 Boundary 接住,渲染表格兜底
          if (assembleErr instanceof ChartAssembleError) {
            traceLogger.trace({
              phase: "chart-assemble",
              ctx: {
                chartType: intent.chartType,
                groupBy: groupField,
                metrics: metricList,
                rowCount: rows.length,
                reason: assembleErr.reason,
              },
              err: assembleErr,
              level: "warn",
            });
            logger.warn(
              `[GUARD-V2-2] ChartAssembleError → fallback rows: ${assembleErr.message}`,
            );
            return {
              error: assembleErr.message,
              chart: null,
              chartType: intent.chartType,
              chartSource: "fallback" as const,
              metrics: metricList,
              metricLabels,
              groupBy: groupField,
              rows, // [M13-V2] rows 用于前端表格降级
              intent,
            };
          }
          throw assembleErr;
        }

        return {
          chartType: intent.chartType,
          chart,
          chartSource,
          metrics: metricList,
          metricLabels,
          groupBy: groupField,
          rows, // [M6-L4] SQL 聚合结果,前端 ErrorBoundary 表格降级用
          intent, // [M13-V2] 返回意图便于前端展示/调试
        };
      } catch (err) {
        traceLogger.trace({
          phase: "tool-result",
          ctx: {
            chartType,
            groupBy: groupField,
            metrics: metricList,
            region,
            category,
            timeRange: timeRange ?? "(default 30d)",
            sessionId: input.sessionId,
          },
          err,
          level: "error",
        });
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "gen_chart",
      description:
        // [M9-Bug B Step 1] 强化触发词 + [M13-V2] 提示 LLM 仅输出意图
        // [M5-Patch-Fix] 严禁 ASCII 兜底;明确 colorPalette/mapType/layout 字段已开放
        "【强制图表触发】生成销售数据可视化图表。**当用户提到 占比/分布/地图/趋势/对比/可视化/画图/饼图/柱状图/折线图/热力图/桑基/漏斗/雷达/3D/水球/词云/紫色/红色/全屏展示 等任何图表或样式关键词时,必须调用本工具,严禁用 ASCII 字符手绘图表、严禁用纯文字描述图表!**\n\n" +
        "支持全量 ECharts 系列 (30 类):line/bar/pie/scatter/area/heatmap/treemap/sankey/funnel/gauge/radar/parallel/sunburst/boxplot/candlestick/graph/tree/themeRiver/map/bar3D/scatter3D/surface3D/map3D/liquidFill/wordCloud/custom。\n\n" +
        "**【M5-Patch-Fix】样式与布局字段已开放 — 后端会自动注入用户指定的样式,LLM 不需要也无法自行绘图**:\n" +
        "- colorPalette: 字符串数组,中文颜色名 (红/蓝/紫/金黄/...) 自动转 hex;颜色系 (红色系/暖色调) 转 3-5 个同色系 hex\n" +
        "- mapType: 'china' (默认) / 'world' / 'usa' / 'prov-<拼音>'\n" +
        "- layout: 'inline' (默认) / 'fullscreen'\n" +
        "**【M12】map 系列已支持中国省份 GeoJSON**,series.data[].name 用中文省份名 ('北京' / '广东' / '上海' 等);map3D 仍降级 bar。\n\n" +
        "**【M13-V2】chartType 字段由后端 ChartAssembler 装配,你只需选择最合适的 chartType,装配逻辑由代码 100% 完成**。\n\n" +
        "参数提示:\n" +
        "- 看趋势必须 line + groupBy=month|day|week|quarter\n" +
        "- 多 metric 自动展开为多 series + 双 Y 轴\n" +
        "- groupBy 默认查全量历史(不限时间); 用户明确指定 timeRange (今天/本月/上月/今年) 才过滤",
      schema: GenChartArgsSchema,
    },
  );
}