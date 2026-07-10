import { z } from "zod";
import { ECHART_SERIES_TYPES } from "@workspace/types";

/**
 * [Sprint 2] V3 工具参数 schema 重构
 *
 * 所有 region/category/state/segment/... 等业务 enum 全部删除。
 * LLM 看到的工具签名是通用的,与具体业务表结构解耦。
 * 具体列名/dimension 由 PlannerAgent 从 MetadataCache
 * 动态读出,并通过 System Prompt 注入到 LLM。
 *
 * 工具职责分工(Sprint 2 → Sprint 5.5):
 *   - query_details  → 接收 dataSourceId + 任意 column 名 (string),
 *     gateway.executeIntent() 翻译成 SQL。
 *   - gen_chart      → 同样。接收 dataSourceId + 任意 column,
 *     仍走 chartHelper.assemble() (V2 装配确定性不变)。
 *   - generate_insight → 保持不变。
 *   - get_table_schema → LLM 在 schema 被截断时调用。
 *
 * Sprint 5.5: query_sales 已删除（原为 Superstore 兼容包装）。
 */

// ============================================================
// query_details / gen_chart 通用 groupBy
// ============================================================
/**
 * [Sprint 2] 不再硬编码枚举 groupBy。LLM 直接输出列名字符串。
 * Gateway 在执行前会校验 column 是否在 MetadataSnapshot.tables 里。
 *
 * [Sprint 5.7] 去掉 ASCII-only regex,允许 LLM 输出中文名列名,
 * remapChineseToPhysical() 会在 SQL 执行前自动转换为物理名。
 */
export const ColumnNameSchema = z
  .string()
  .min(1)
  .max(64);

export const AggregationKindSchema = z.enum([
  "SUM",
  "AVG",
  "COUNT",
  "COUNT_DISTINCT",
  "MIN",
  "MAX",
]);

/**
 * 聚合表达式 — 列名 + 聚合函数 + 结果别名 + 中文/英文标签
 * (LLM 在 table-only / table+groupBy 两种模式下都可产出)
 */
export const MetricSpecSchema = z.object({
  column: ColumnNameSchema,
  agg: AggregationKindSchema,
  alias: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
});

export const FilterOpSchema = z.enum([
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "IN",
  "LIKE",
  "BETWEEN",
]);

export const FilterSpecSchema = z.object({
  column: ColumnNameSchema,
  op: FilterOpSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

// ============================================================
// query_details — 任意维度任意指标聚合 (V3 主路径)
// ============================================================

export const QueryDetailsArgsSchema = z.object({
  dataSourceId: z
    .string()
    .min(1)
    .max(64)
    .describe(
      "当前会话绑定的数据源 id。**必填**。前端 ChatHeader 自动注入,LLM 直接透传即可。",
    ),

  /** 主表(查询入口) */
  table: ColumnNameSchema.describe(
    "主表名,从 system prompt 列出的 MetadataSnapshot 中选取。",
  ),

  /**
   * GROUP BY 列列表。
   * 空数组 = 不聚合,直接返回明细行(配合 filters / orderBy / limit)
   */
  groupBy: z
    .array(ColumnNameSchema)
    .default([])
    .describe("GROUP BY 列名列表。空 = 明细行模式。"),

  metrics: z
    .array(MetricSpecSchema)
    .default([])
    .describe(
      "聚合指标列表。聚合表达式 = agg(column) AS alias。空 = 明细行模式。",
    ),

  filters: z
    .array(FilterSpecSchema)
    .default([])
    .describe("WHERE 条件。每项 = column OP value。"),

  orderBy: z
    .object({
      column: z.union([ColumnNameSchema, z.string()]),
      direction: z.enum(["ASC", "DESC"]),
    })
    .optional()
    .describe("排序。column 是结果集里的字段名(可以 alias 或原始列名)。"),

  topN: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("返回前 N 条。明细模式强 ≤ 50(由 gateway 强制)。"),
});

export type QueryDetailsArgs = z.infer<typeof QueryDetailsArgsSchema>;

// ============================================================
// gen_chart — V3 仍复用 V2 ChartHelper 装配逻辑
// ============================================================

export const GenChartArgsSchema = z.object({
  dataSourceId: z.string().min(1).max(64),

  /**
   * [Sprint 2] 包含 table + groupBy + metrics + filters 的 QueryIntent。
   * 与 query_details 同构。chart 工具在内部直接 translate
   * 到 QueryIntent → gateway.executeIntent → 拿 rows →
   * chartHelper.assemble(intent, rows, ctx)。
   */
  table: ColumnNameSchema,
  groupBy: z.array(ColumnNameSchema).default([]),
  metrics: z.array(MetricSpecSchema).default([]),
  filters: z.array(FilterSpecSchema).default([]),
  topN: z.number().int().min(1).max(100).default(10),

  chartType: z
    .enum([...ECHART_SERIES_TYPES, "area"] as const)
    .nullish()
    .describe(
      "图表类型 (30 种 ECharts series + 'area' 等价 line + areaStyle)。不填由 ChartAgent 自动选型。",
    ),

  // [M5-Patch] Planner 显式传样式/地图/布局意图
  colorPalette: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .nullish()
    .describe(
      "用户指定的颜色数组(如 ['#800080'] = 紫色;['red'] = 命名色)。未指定不传。",
    ),
  mapType: z
    .string()
    .min(1)
    .max(50)
    .nullish()
    .describe("地图类型: 'china' / 'world' / 'usa' / 'prov-<拼音>'。"),
  layout: z
    .enum(["inline", "fullscreen"])
    .nullish()
    .describe("布局模式。'fullscreen' = 大屏/全屏展示。"),
});

export type GenChartArgs = z.infer<typeof GenChartArgsSchema>;

// ============================================================
// get_table_schema — LLM 动态调用,展开某张表的全部列细节
// ============================================================

export const GetTableSchemaArgsSchema = z.object({
  dataSourceId: z.string().min(1).max(64),
  table: ColumnNameSchema.describe(
    "需要查看完整字段信息的表名(从 system prompt 的 MetadataSnapshot 列表中选)",
  ),
});

export type GetTableSchemaArgs = z.infer<typeof GetTableSchemaArgsSchema>;

// ============================================================
// generate_insight — 保持原样 (与数据源无关)
// ============================================================
export const GenerateInsightArgsSchema = z.object({
  question: z.string().describe("用户的原始问题,用于分析上下文"),
  data: z
    .any()
    .optional()
    .describe(
      "要分析的数据集(通常是 query_details / gen_chart 的返回)。**若留空,系统会自动从最近一条工具结果补全**",
    ),
  context: z
    .string()
    .nullish()
    .describe("会话中其他相关工具调用的简短摘要"),
  focus: z
    .enum(["general", "trend", "anomaly", "opportunity", "risk"])
    .nullish(),
  sessionId: z.string().optional().describe("当前会话ID,由系统自动注入,用于数据兜底"),
});

// ============================================================
// [M13-V2 保留] ChartIntent — 给 ChartAgent.extractIntent 用
// ------------------------------------------------------------
// 注意:此 schema 是给"inner LLM"用的(ChartAgent),不是给 PlannerAgent 的。
// 保持原有字段不动,以保证 chart.helper.ts 装配逻辑 0 变更。
// ============================================================

export const ChartIntentSchema = z.object({
  chartType: z
    .enum([...ECHART_SERIES_TYPES, "area"] as const)
    .describe("图表系列类型 (30 种 ECharts + 'area'),严格匹配下方 ENUM"),
  xField: z
    .string()
    .min(1)
    .default("name")
    .describe("x 轴字段名,数据中存在的字符串/时间字段"),
  yField: z
    .string()
    .min(1)
    .describe("y 轴字段名,必填,数值字段(列名或 alias)"),
  groupBy: z.string().optional().describe("用户语义上的分组维度(辅助 title)"),
  metrics: z
    .array(z.string())
    .optional()
    .describe("用到的指标数组(用 alias 字符串)"),

  // [M5-Patch]
  colorPalette: z.array(z.string().min(1)).min(1).max(20).optional(),
  mapType: z.string().min(1).max(50).optional(),
  layout: z.enum(["inline", "fullscreen"]).optional(),
});

export type ChartIntent = z.infer<typeof ChartIntentSchema>;

// ============================================================
// [Sprint 5.5] query_sales 兼容 schema 已删除
// ============================================================