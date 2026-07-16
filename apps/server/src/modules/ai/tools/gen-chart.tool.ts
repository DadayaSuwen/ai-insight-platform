import { StructuredTool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";
import { GenChartArgsSchema, type ChartIntent } from "./schemas";
import { ChartHelper, ChartAssembleError } from "./chart.helper";
import { ChartAgent } from "../agents/chart.agent";
import { DatasourceService } from "../../datasource/datasource.service";
import { MetadataService } from "../../datasource/metadata/metadata.service";
import { QueryGatewayService } from "../../datasource/query-gateway/query-gateway.service";
import type { QueryIntent } from "@workspace/types";
import { traceLogger } from "../debug-log";
import { buildFieldMapping } from "./field-mapping";

/**
 * [Sprint 2] V3 gen_chart — 跨数据源通用图表工具
 *
 * 输入 dataSourceId + 任意 table/column(同 query_details 的 QueryIntent
 * 形态),通过 QueryGateway 拿 rows,然后仍走 V2 的:
 *   chartAgent.extractIntent(rows, message, ctx) → ChartIntent
 *   chartHelper.assemble(intent, rows, ctx)     → EChartsOption
 *
 * V2 chart.helper.ts / chart.agent.ts 完全不动,只换上游数据来源。
 *
 * [Sprint 5.7] 重构为 class-based StructuredTool,修复 tool() 函数
 *   返回对象时被序列化为 [object Object] 的问题。
 *
 * 注意: PlannerAgent 会在 toolArgs 中注入 originalMessage + sessionId,
 * schema 允许 passthrough 以便这些额外字段能传递到 _call()。
 */
const GenChartArgsSchemaPassthrough = GenChartArgsSchema.passthrough();

/**
 * [Fix] 基础柱状图兜底 — 当 ChartAgent / ChartHelper 完全失败时,
 * 用 raw rows 直接拼一个最小可用的 ECharts bar option。
 */
function buildBasicBarChart(
  rows: Record<string, any>[],
  groupField: string | null,
  metrics: Array<{ alias: string; label: string }>,
): Record<string, unknown> {
  const xData = rows.map((r) =>
    String(r[groupField ?? "name"] ?? r.name ?? ""),
  );
  return {
    title: { text: "查询结果", left: "center" },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: xData,
      axisLabel: { rotate: xData.length > 6 ? 30 : 0 },
    },
    yAxis: { type: "value" },
    series: metrics.map((m) => ({
      name: m.label || m.alias,
      type: "bar",
      data: rows.map((r) => Number(r[m.alias] ?? 0)),
    })),
  };
}

export class GenChartTool extends StructuredTool {
  private readonly logger = new Logger("GenChartTool");

  name = "gen_chart";

  description =
    "**V3 通用图表工具**:对当前会话绑定的数据源生成可视化图表。" +
    "**当用户提到 占比/分布/地图/趋势/对比/可视化/画图/饼图/柱状图/折线图/热力图/桑基/漏斗/雷达/3D/水球/词云/紫色/红色/全屏展示 等任何图表或样式关键词时,必须调用本工具,严禁用 ASCII 字符手绘图表、严禁用纯文字描述图表!**\n\n" +
    "支持全量 ECharts 系列 (30 类):line/bar/pie/scatter/area/heatmap/treemap/sankey/funnel/gauge/radar/parallel/sunburst/boxplot/candlestick/graph/tree/themeRiver/map/bar3D/scatter3D/surface3D/map3D/liquidFill/wordCloud/custom。\n\n" +
    "样式/地图/布局字段:\n" +
    "- colorPalette: 字符串数组\n" +
    "- mapType: 'china' / 'world' / 'usa' / 'prov-<拼音>'\n" +
    "- layout: 'inline' (默认) / 'fullscreen'\n\n" +
    "**传入与 query_details 同构的 QueryIntent**:dataSourceId + table + groupBy[] + metrics[] + filters[] + topN。\n" +
    "**必须**先确认 system prompt 中的 MetadataSnapshot 列出该 table 与 column;若看不到全量字段,先调 get_table_schema。";

  schema = GenChartArgsSchemaPassthrough;

  constructor(
    private readonly ds: DatasourceService,
    private readonly metadataService: MetadataService,
    private readonly gateway: QueryGatewayService,
    private readonly chartHelper: ChartHelper,
    private readonly chartAgent: ChartAgent,
    private readonly currentUserId: string, // [Sprint 5]
  ) {
    super();
  }

  async _call(
    input: import("zod").infer<typeof GenChartArgsSchema> & {
      originalMessage?: string;
      sessionId?: string;
    },
  ): Promise<string> {
    // [Fix] 变量提升到 try 块外，outer catch 兜底图表时需要
    let rows: Record<string, number | string>[] = [];
    let firstGroup: string | undefined;
    let metricList: Array<{ alias: string; label: string; column: string; agg: string }> = [];
    let metricLabels: Record<string, string> = {};
    let fieldMapping: Record<string, string> = {};

    try {
      const {
        dataSourceId,
        table,
        groupBy,
        metrics,
        filters,
        topN,
        chartType,
      } = input;
      metricList = metrics ?? [];
      const groupField = (groupBy ?? [])[0] ?? null;

      // 1. 取 snapshot + config
      const record = await this.ds.getByIdForUser(
        dataSourceId,
        this.currentUserId,
      );
      if (!record) {
        return JSON.stringify({ error: `DataSource "${dataSourceId}" not found` });
      }
      const snapshot = await this.metadataService.get(dataSourceId);

      // [Sprint 5.7] 构建 fieldMapping: 物理名 → 中文名
      const metricAliases = metricList.map((m) => m.alias);
      const fieldMetricLabels = metricList.reduce(
        (acc, m) => (m.label ? { ...acc, [m.alias]: m.label } : acc),
        {} as Record<string, string>,
      );
      fieldMapping = buildFieldMapping(
        snapshot,
        table,
        metricAliases,
        fieldMetricLabels,
      );

      // 2. 构造 QueryIntent
      const intent: QueryIntent = {
        dataSourceId,
        intentType: (groupBy ?? []).length > 0 ? "aggregate" : "detail",
        table,
        joins: [],
        groupBy: groupBy ?? [],
        metrics: metricList.map((m) => ({
          column: m.column,
          agg: m.agg,
          alias: m.alias,
          label: m.label,
        })) as QueryIntent["metrics"],
        filters,
        orderBy:
          metricList.length > 0
            ? { column: metricList[0].alias, direction: "DESC" }
            : undefined,
        limit:
          (groupBy ?? []).length === 0
            ? Math.min(topN ?? 10, 50)
            : (topN ?? 10),
      };

      // 3. 走 QueryGateway
      const result = await this.gateway.executeIntent(
        dataSourceId,
        this.currentUserId, // [Sprint 5]
        intent,
        snapshot,
      );

      // 4. 标准化 rows — 第一列重命名为 'name' (沿用 V2 chartHelper 契约)
      // [Sprint 5.7+] 日期格式化: ISO 字符串 → YYYY-MM-DD
      const fmtDate = (v: unknown): string => {
        const s = String(v ?? "");
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
          return s.slice(0, 10); // "2016-12-31T..." → "2016-12-31"
        }
        return s;
      };
      firstGroup = (groupBy ?? [])[0];
      rows = result.rows.map((r) => {
        const normalized: Record<string, number | string> = {};
        if (firstGroup && firstGroup in r) {
          normalized.name = fmtDate(r[firstGroup]);
          for (const g of (groupBy ?? []).slice(1)) {
            if (g in r) normalized[g] = fmtDate(r[g]);
          }
        } else {
          normalized.name = firstGroup
            ? "(no group)"
            : String(Object.values(r)[0] ?? "");
        }
        for (const m of metricList) {
          normalized[m.alias] = Number(r[m.alias] ?? 0);
        }
        return normalized;
      });

      if (rows.length === 0) {
        return JSON.stringify({ error: "未查询到相关数据,无法生成图表" });
      }

      // 5. [V2 装配路径] — 100% 复用 chartAgent + chartHelper
      metricLabels = metricList.reduce(
        (acc, m) => ({ ...acc, [m.alias]: m.label }),
        {} as Record<string, string>,
      );
      const contextMessage =
        input.originalMessage ?? `${table} ${chartType} chart`;
      const ctx = {
        chartTypeHint: chartType,
        groupBy: firstGroup ?? "none",
        groupLabel: firstGroup ?? "明细",
        metrics: metricList.map((m) => m.alias),
        metricLabels,
        sessionId: input.sessionId,
        originalMessage: input.originalMessage,
        explicitColorPalette: input.colorPalette ?? null,
        explicitMapType: input.mapType ?? null,
        explicitLayout: input.layout ?? null,
      };
      const chartIntent: ChartIntent = await this.chartAgent.extractIntent(
        rows,
        contextMessage,
        ctx,
      );

      let chart: Record<string, unknown>;
      let chartSource: "agent" | "fallback" = "agent";
      try {
        chart = this.chartHelper.assemble(
          chartIntent,
          rows,
          { groupLabel: ctx.groupLabel },
          fieldMapping,
        ) as Record<string, unknown>;
      } catch (assembleErr) {
        if (assembleErr instanceof ChartAssembleError) {
          traceLogger.trace({
            phase: "chart-assemble",
            ctx: {
              chartType: chartIntent.chartType,
              groupBy: firstGroup,
              metrics: metricList.map((m) => m.alias),
              rowCount: rows.length,
              reason: assembleErr.reason,
            },
            err: assembleErr,
            level: "warn",
          });
          this.logger.warn(
            `[GUARD-V2-2] ChartAssembleError → fallback rows: ${assembleErr.message}`,
          );
          return JSON.stringify({
            error: assembleErr.message,
            chart: null,
            chartType: chartIntent.chartType,
            chartSource: "fallback" as const,
            metrics: metricList.map((m) => m.alias),
            metricLabels,
            groupBy: firstGroup,
            rows,
            intent: chartIntent,
            fieldMapping,
          });
        }
        throw assembleErr;
      }

      return JSON.stringify({
        chartType: chartIntent.chartType,
        chart,
        chartSource,
        metrics: metricList.map((m) => m.alias),
        metricLabels,
        groupBy: firstGroup,
        rows,
        intent: chartIntent,
        fieldMapping,
      });
    } catch (err) {
      traceLogger.trace({
        phase: "tool-result",
        ctx: {
          dataSourceId: input.dataSourceId,
          table: input.table,
          metrics: (input.metrics ?? []).map((m) => m.alias),
          sessionId: input.sessionId,
        },
        err,
        level: "error",
      });

      // [Fix] 即使 ChartAgent/ChartHelper 完全失败，也用 rows 生成基础柱状图兜底
      if (rows.length > 0) {
        try {
          const basicChart = buildBasicBarChart(rows, firstGroup ?? null, metricList);
          return JSON.stringify({
            chartType: "bar",
            chart: basicChart,
            chartSource: "fallback",
            metrics: metricList.map((m) => m.alias),
            metricLabels,
            groupBy: firstGroup ?? null,
            rows,
            fieldMapping,
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // 连兜底图表都失败 → 回退到纯 error
        }
      }

      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
