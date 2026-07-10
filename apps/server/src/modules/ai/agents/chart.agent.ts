import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { LlmService } from "../llm/llm.service";
import { METRIC_LABELS, type MetricKey } from "../tools/metric-labels";
import type { EChartSeriesType } from "@workspace/types";
import { traceLogger } from "../debug-log";
import { type ChartIntent } from "../tools/schemas";

/**
 * ChartAgent (V2 重构 — IntentExtractor)
 *
 * [GUARD-V2-1] **LLM 输出隔离**: 本类绝不返回 EChartsOption 结构。
 * LLM 仅输出最小意图 JSON {chartType, xField, yField, groupBy, metrics},
 * 由 ChartAssembler (chart.helper.ts) 100% 装配 EChartsOption。
 *
 * 链路:
 *   gen-chart.tool.ts
 *     → SQL 聚合得到 rows
 *     → chartAgent.extractIntent(rows, message, ctx)
 *     → chartHelper.assemble(intent, rows, ctx)
 *     → SSE tool_result { chart, intent, chartSource: "agent", ... }
 */

const DATA_TRUNCATE_THRESHOLD = 100;

/**
 * 上下文 — Planner/工具层注入的运行时信息
 */
export interface ChartAgentContext {
  /** Planner 推断的 chartType 提示 (允许 null,因 GenChartArgsSchema.chartType 是 nullish) */
  chartTypeHint?: string | null;
  /** SQL 阶段确定的 groupBy 维度 */
  groupBy?: string;
  /** groupBy 中文标签 (用于 title) */
  groupLabel?: string;
  /** SQL 已计算的指标列表 — [Sprint 2] 改为 string[],不再限 MetricKey enum */
  metrics?: string[];
  metricLabels?: Record<string, string>;
  /** [GUARD-1a] 数据是否被截断 (rows > 100 时) */
  dataTruncated?: boolean;
  /** [GUARD-1a] 截断前的原始行数 */
  originalRowCount?: number;
  /** 用户原始问句 (供 intentFallback 关键词推断) */
  originalMessage?: string;

  // ─────────────────────────────────────────────────────────────
  // [M5-Patch-Fix] Planner 显式传入的样式/地图/布局意图
  // 优先级: explicit > inner LLM 提取 > undefined
  // 注入方式: gen-chart.tool.ts 154 行 ctx 拼装时填入
  // ─────────────────────────────────────────────────────────────
  /** Planner 显式指定的用户颜色 (如 ['#800080']) */
  explicitColorPalette?: string[] | null;
  /** Planner 显式指定的地图类型 (如 'world' / 'prov-guangdong') */
  explicitMapType?: string | null;
  /** Planner 显式指定的布局 ('inline' | 'fullscreen') */
  explicitLayout?: "inline" | "fullscreen" | null;
}

const CHART_INTENT_PROMPT = `你是图表选型助手。根据用户问题 + 已聚合数据 + Planner 上下文,选择最合适的 ECharts 系列类型并指定字段映射。

【硬规则】
1. 仅返回 JSON 对象,无 markdown fence、无 prose、无解释
2. chartType 必须是 30 个 ECharts series 枚举值之一 (line / bar / pie / scatter / area / map / heatmap / treemap / sankey / funnel / gauge / radar / parallel / sunburst / boxplot / candlestick / graph / tree / themeRiver / pictorialBar / bar3D / scatter3D / surface3D / map3D / line3D / points3D / lines3D / liquidFill / wordCloud / custom)
3. xField: x 轴字段名 (默认 "name")
4. yField: y 轴字段名,必填,数值字段 (sales / quantity / profit / discount / orderCount)
5. groupBy: 用户语义上的分组维度,可省略
6. metrics: 多指标时填入,可省略
7. **严禁** 输出 series / xAxis / yAxis / tooltip / legend / 任何 ECharts 配置字段 — 装配由代码完成

【选型指引】
- 占比 / 构成 / 比例 (≤7 类) → pie
- 占比 (>7 类) → treemap / sunburst
- 趋势 / 月度变化 → line (groupBy 含 month/day/week/quarter 优先)
- 类别对比 → bar
- 范围 / 极值 / 中位数 → boxplot
- K 线 / OHLC → candlestick
- 多维评分 → radar
- 流向 / 来源去向 → sankey
- 单调下降 → funnel
- 仪表 / 完成率 → gauge
- 地理分布 → map (中国省份,groupBy=state)
- 词频 → wordCloud
- 完成率 KPI → liquidFill / gauge
- 累积趋势 → area

【样式与布局】(M5-Patch)
- 用户指定颜色 ("红色" / "蓝色系" / "用蓝绿色" / "#ff0000") → colorPalette: ["#ff0000" 或对应 hex]
  - 中文颜色名 → 转 hex ("红"→"#ff0000","蓝绿"→"#00ffff","金黄"→"#ffd700")
  - 颜色系 ("红色系" / "暖色调") → 3-5 个同色系 hex 数组
- 用户说 "全屏展示" / "大屏" / "铺满" → layout: "fullscreen"
- 未指定则不填,前端自动处理

【地图系列】(M5-Patch)
- 用户说 "中国地图" / 未指定地理范围 → mapType: "china"
- 用户说 "世界地图" / "全球" → mapType: "world"
- 用户说 "美国地图" → mapType: "usa"
- 用户说某省 (如 "广东省" / "江苏省") → mapType: "prov-<拼音>" (例 "prov-guangdong")

【数据上下文】
- 数据样本 (前 8 条) 会在 human message 中给出,你只需从中识别字段名
- ctx.metrics 是 Planner 已确定的指标列表,yField 优先从 metrics 选`;

@Injectable()
export class ChartAgent {
  private readonly logger = new Logger(ChartAgent.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * [GUARD-V2-1] 主入口: LLM 提取最小意图。
   * 不抛错 — 失败时降级 intentFallback()。
   */
  async extractIntent(
    rows: Array<Record<string, number | string>>,
    message: string,
    ctx?: ChartAgentContext,
  ): Promise<ChartIntent> {
    // [GUARD-1a] 数据截断
    let workingData = rows ?? [];
    let dataTruncated = false;
    let originalRowCount = workingData.length;
    if (workingData.length > DATA_TRUNCATE_THRESHOLD) {
      this.logger.warn(
        `[GUARD-1a] data rows ${workingData.length} > ${DATA_TRUNCATE_THRESHOLD}, truncating`,
      );
      workingData = workingData.slice(0, DATA_TRUNCATE_THRESHOLD);
      dataTruncated = true;
    }

    const enrichedCtx: ChartAgentContext = {
      ...(ctx ?? {}),
      dataTruncated,
      originalRowCount,
    };

    try {
      const human = buildIntentUserMessage(message, workingData, enrichedCtx);
      const intent = await this.llm.invokeStructured<typeof ChartIntentSchemaType>({
        system: CHART_INTENT_PROMPT,
        human,
        schema: ChartIntentSchemaType,
        timeoutMs: 15_000,
        temperature: 0,
      });
      // 缺失字段从 ctx 兜底
      return this.fillIntentFields(intent as ChartIntent, enrichedCtx, workingData);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[M13-V2] extractIntent LLM 失败 → intentFallback: ${msg}`);
      traceLogger.trace({
        phase: "intent-mode",
        ctx: {
          chartTypeHint: enrichedCtx.chartTypeHint,
          groupBy: enrichedCtx.groupBy,
          metrics: enrichedCtx.metrics,
          rowCount: workingData.length,
        },
        err: error,
        level: "warn",
      });
      return this.intentFallback(workingData, enrichedCtx);
    }
  }

  /**
   * 缺失字段兜底 — 让 ChartIntent 总是完整
   * [M5-Patch-Fix] Planner 显式 ctx 字段优先级 > inner LLM 提取
   */
  private fillIntentFields(
    intent: ChartIntent,
    ctx: ChartAgentContext,
    rows: Array<Record<string, number | string>>,
  ): ChartIntent {
    const fields = rows[0] ? Object.keys(rows[0]) : ["name"];
    const xField = intent.xField ?? (fields.includes("name") ? "name" : fields[0]);
    const yField = intent.yField ?? ctx.metrics?.[0] ?? fields.find((f) => f !== xField) ?? "value";
    const explicitColor = ctx.explicitColorPalette;
    const explicitMap = ctx.explicitMapType;
    const explicitLayout = ctx.explicitLayout;
    return {
      chartType: intent.chartType,
      xField,
      yField,
      groupBy: intent.groupBy ?? (ctx.groupBy as ChartIntent["groupBy"]),
      metrics: intent.metrics ?? ctx.metrics,
      // [M5-Patch-Fix] explicit 优先级最高,inner LLM 提取值只在 explicit 为空时使用
      colorPalette: explicitColor && explicitColor.length > 0 ? explicitColor : intent.colorPalette,
      mapType: explicitMap ?? intent.mapType,
      layout: explicitLayout ?? intent.layout,
    };
  }

  /**
   * [GUARD-V2-1] 关键词兜底(无 LLM 调用)
   * Planner 已传 chartTypeHint → 直接用,否则 detectChartType 关键词推断
   * [M5-Patch-Fix] explicit 字段透传(LLM 失败时仍保留 Planner 显式意图)
   */
  private intentFallback(
    rows: Array<Record<string, number | string>>,
    ctx: ChartAgentContext,
  ): ChartIntent {
    let chartType: EChartSeriesType = (ctx.chartTypeHint as EChartSeriesType) ?? "bar";
    if (!ctx.chartTypeHint && ctx.originalMessage) {
      chartType = this.detectChartType(ctx.originalMessage) as EChartSeriesType;
    }
    const fields = rows[0] ? Object.keys(rows[0]) : ["name"];
    const xField = fields.includes("name") ? "name" : fields[0];
    const yMetric =
      ctx.metrics?.[0] ?? fields.find((f) => f !== xField) ?? "value";
    const explicitColor = ctx.explicitColorPalette;
    const explicitMap = ctx.explicitMapType;
    const explicitLayout = ctx.explicitLayout;
    return {
      chartType,
      xField,
      yField: yMetric,
      groupBy: ctx.groupBy as ChartIntent["groupBy"],
      metrics: ctx.metrics,
      // [M5-Patch-Fix] 即使 LLM 失败,Planner 显式字段仍生效
      colorPalette: explicitColor && explicitColor.length > 0 ? explicitColor : undefined,
      mapType: explicitMap ?? undefined,
      layout: explicitLayout ?? undefined,
    };
  }

  /**
   * 关键词推断 chartType (仅作为 LLM 失败的兜底)
   */
  private detectChartType(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("饼") || m.includes("占比") || m.includes("pie")) return "pie";
    if (m.includes("热力") || m.includes("heatmap")) return "heatmap";
    if (m.includes("漏斗") || m.includes("funnel")) return "funnel";
    if (m.includes("雷达") || m.includes("radar")) return "radar";
    if (m.includes("桑基") || m.includes("sankey")) return "sankey";
    if (m.includes("矩形树") || m.includes("treemap")) return "treemap";
    if (m.includes("地图") || m.includes("省份")) return "map";
    if (m.includes("折线") || m.includes("趋势")) return "line";
    if (m.includes("散点") || m.includes("scatter")) return "scatter";
    if (m.includes("面积") || m.includes("area")) return "area";
    if (m.includes("3d") || m.includes("三维")) return "bar3D";
    if (m.includes("词云") || m.includes("wordcloud")) return "wordCloud";
    if (m.includes("水球") || m.includes("liquidfill")) return "liquidFill";
    if (m.includes("仪表") || m.includes("gauge")) return "gauge";
    if (m.includes("柱") || m.includes("bar")) return "bar";
    return "bar";
  }
}

// ============================================================
// helpers
// ============================================================

/** LLM 输入 schema 引用 (运行时 zod instance)
 *  与 schemas.ts 的 ChartIntentSchema 字段对齐,运行时放宽 (chartType 接受任意字符串供 fallback)
 *  [M5-Patch] 新增 colorPalette/mapType/layout 字段
 */
const ChartIntentSchemaType = z.object({
  chartType: z.string(),
  xField: z.string().optional(),
  yField: z.string(),
  groupBy: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  colorPalette: z.array(z.string()).optional(),
  mapType: z.string().optional(),
  layout: z.enum(["inline", "fullscreen"]).optional(),
});

function buildIntentUserMessage(
  userMessage: string,
  data: Array<Record<string, number | string>>,
  ctx: ChartAgentContext,
): string {
  const dataPreview = JSON.stringify(data.slice(0, 8), null, 2);
  const ctxLines: string[] = [];

  // [M5-Patch-Fix] Planner 显式传 → 优先级最高,在 ctxLines 最前面显眼位置注入,
  //   提示 inner LLM 不要覆盖。fillIntentFields 也会二次校验 explicit 优先级。
  if (ctx.explicitColorPalette && ctx.explicitColorPalette.length > 0) {
    ctxLines.push(
      `- ⚠️ Planner 已显式指定 colorPalette: ${JSON.stringify(ctx.explicitColorPalette)} (请勿覆盖)`,
    );
  }
  if (ctx.explicitMapType) {
    ctxLines.push(
      `- ⚠️ Planner 已显式指定 mapType: "${ctx.explicitMapType}" (请勿覆盖)`,
    );
  }
  if (ctx.explicitLayout) {
    ctxLines.push(
      `- ⚠️ Planner 已显式指定 layout: "${ctx.explicitLayout}" (请勿覆盖)`,
    );
  }

  if (ctx.chartTypeHint) ctxLines.push(`- chartType 提示: ${ctx.chartTypeHint}`);
  if (ctx.groupBy) ctxLines.push(`- 分组维度: ${ctx.groupBy} (${ctx.groupLabel ?? ""})`);
  if (ctx.metrics?.length) {
    const labels = ctx.metricLabels ?? {};
    ctxLines.push(
      `- 指标 (metrics): ${ctx.metrics.map((m) => `${m}=${labels[m] ?? m}`).join(", ")}`,
    );
  }
  if (ctx.dataTruncated) {
    ctxLines.push(
      `- ⚠️ 数据已截断至 Top ${data.length} (原 ${ctx.originalRowCount ?? "?"} 条)`,
    );
  }

  return `用户问题: ${userMessage}

数据样本 (前 8 条):
${dataPreview}

数据上下文:
${ctxLines.join("\n") || "(无)"}

请直接输出 ChartIntent JSON,严格遵守硬规则。如果 Planner 已显式指定 colorPalette/mapType/layout,务必原样透传,不要修改。`;
}