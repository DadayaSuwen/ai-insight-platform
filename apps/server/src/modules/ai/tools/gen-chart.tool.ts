import { tool } from "@langchain/core/tools";
import { Logger } from "@nestjs/common";
import { GenChartArgsSchema, type ChartIntent, type GenChartArgs } from "./schemas";
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
 */
export function createGenChartTool(
  ds: DatasourceService,
  metadata: MetadataService,
  gateway: QueryGatewayService,
  chartHelper: ChartHelper,
  chartAgent: ChartAgent,
  currentUserId: string, // [Sprint 5]
) {
  const logger = new Logger("GenChartTool");
  return tool(
    async (
      input: GenChartArgs & {
        // 由 Planner 注入的运行时上下文 (不来自 LLM args)
        originalMessage?: string;
        sessionId?: string;
      },
    ) => {
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
        const metricList = metrics;
        const groupField = groupBy[0] ?? null;

        // 1. 取 snapshot + config
        const record = await ds.getByIdForUser(dataSourceId, currentUserId);
        if (!record) {
          return { error: `DataSource "${dataSourceId}" not found` };
        }
        const snapshot = await metadata.get(dataSourceId);

        // [Sprint 5.7] 构建 fieldMapping: 物理名 → 中文名
        const metricAliases = metricList.map(m => m.alias);
        const fieldMapping = buildFieldMapping(snapshot, table, metricAliases);

        // 2. 构造 QueryIntent
        const intent: QueryIntent = {
          dataSourceId,
          intentType: groupBy.length > 0 ? "aggregate" : "detail",
          table,
          joins: [],
          groupBy,
          metrics: metricList.map(m => ({
            column: m.column,
            agg: m.agg,
            alias: m.alias,
            label: m.label,
          })),
          filters,
          orderBy:
            metricList.length > 0
              ? { column: metricList[0].alias, direction: "DESC" }
              : undefined,
          limit: groupBy.length === 0 ? Math.min(topN, 50) : topN,
        };

        // 3. 走 QueryGateway
        const result = await gateway.executeIntent(
          dataSourceId,
          currentUserId, // [Sprint 5]
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
        const firstGroup = groupBy[0];
        const rows = result.rows.map(r => {
          const normalized: Record<string, number | string> = {};
          if (firstGroup && firstGroup in r) {
            normalized.name = fmtDate(r[firstGroup]);
            for (const g of groupBy.slice(1)) {
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
          return { error: "未查询到相关数据,无法生成图表" };
        }

        // 5. [V2 装配路径] — 100% 复用 chartAgent + chartHelper
        const metricLabels = metricList.reduce(
          (acc, m) => ({ ...acc, [m.alias]: m.label }),
          {} as Record<string, string>,
        );
        const contextMessage = input.originalMessage ?? `${table} ${chartType} chart`;
        const ctx = {
          chartTypeHint: chartType,
          groupBy: firstGroup ?? "none",
          groupLabel: firstGroup ?? "明细",
          metrics: metricList.map(m => m.alias),
          metricLabels,
          sessionId: input.sessionId,
          originalMessage: input.originalMessage,
          explicitColorPalette: input.colorPalette ?? null,
          explicitMapType: input.mapType ?? null,
          explicitLayout: input.layout ?? null,
        };
        const chartIntent: ChartIntent = await chartAgent.extractIntent(
          rows,
          contextMessage,
          ctx,
        );

        let chart: Record<string, unknown>;
        let chartSource: "agent" | "fallback" = "agent";
        try {
          chart = chartHelper.assemble(chartIntent, rows, {
            groupLabel: ctx.groupLabel,
          }, fieldMapping) as Record<string, unknown>;
        } catch (assembleErr) {
          if (assembleErr instanceof ChartAssembleError) {
            traceLogger.trace({
              phase: "chart-assemble",
              ctx: {
                chartType: chartIntent.chartType,
                groupBy: firstGroup,
                metrics: metricList.map(m => m.alias),
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
              chartType: chartIntent.chartType,
              chartSource: "fallback" as const,
              metrics: metricList.map(m => m.alias),
              metricLabels,
              groupBy: firstGroup,
              rows,
              intent: chartIntent,
              fieldMapping,
            };
          }
          throw assembleErr;
        }

        return {
          chartType: chartIntent.chartType,
          chart,
          chartSource,
          metrics: metricList.map(m => m.alias),
          metricLabels,
          groupBy: firstGroup,
          rows,
          intent: chartIntent,
          fieldMapping,
        };
      } catch (err) {
        traceLogger.trace({
          phase: "tool-result",
          ctx: {
            dataSourceId: input.dataSourceId,
            table: input.table,
            metrics: input.metrics.map(m => m.alias),
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
        "**V3 通用图表工具**:对当前会话绑定的数据源生成可视化图表。" +
        "**当用户提到 占比/分布/地图/趋势/对比/可视化/画图/饼图/柱状图/折线图/热力图/桑基/漏斗/雷达/3D/水球/词云/紫色/红色/全屏展示 等任何图表或样式关键词时,必须调用本工具,严禁用 ASCII 字符手绘图表、严禁用纯文字描述图表!**\n\n" +
        "支持全量 ECharts 系列 (30 类):line/bar/pie/scatter/area/heatmap/treemap/sankey/funnel/gauge/radar/parallel/sunburst/boxplot/candlestick/graph/tree/themeRiver/map/bar3D/scatter3D/surface3D/map3D/liquidFill/wordCloud/custom。\n\n" +
        "样式/地图/布局字段:\n" +
        "- colorPalette: 字符串数组\n" +
        "- mapType: 'china' / 'world' / 'usa' / 'prov-<拼音>'\n" +
        "- layout: 'inline' (默认) / 'fullscreen'\n\n" +
        "**传入与 query_details 同构的 QueryIntent**:dataSourceId + table + groupBy[] + metrics[] + filters[] + topN。\n" +
        "**必须**先确认 system prompt 中的 MetadataSnapshot 列出该 table 与 column;若看不到全量字段,先调 get_table_schema。",
      schema: GenChartArgsSchema,
    },
  );
}