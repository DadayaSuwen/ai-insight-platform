import { z } from "zod";
import { ECHART_SERIES_TYPES } from "@workspace/types";

// ============================================================
// 共享元数据 (M1 抽出,供 GenChartArgsSchema + QueryDetailsArgsSchema 复用)
// ============================================================

/** query_details / gen_chart 共用的指标 enum */
export const QueryDetailsMetricSchema = z.enum([
  "sales",
  "quantity",
  "profit",
  "discount",
  "orderCount",
]);

/** query_details / gen_chart 共用的 groupBy 维度 enum (除 region/category/month 外) */
export const QueryDetailsGroupBySchema = z.enum([
  "product",
  "customer",
  "state",
  "city",
  "subCategory",
  "segment",
  "shipMode",
  "day",
  "week",
  "quarter",
  "none", // 不聚合,直接返回明细行(limit 强 ≤ 50)
]);

// ============================================================
// Tool Argument Schemas (输入参数)
// ============================================================
// 注意:region/category enum 与 prisma/seed.ts 的 REGION_MAP/CATEGORY_MAP 一一对应,
// CSV 写入 DB 时已转中文,这里不能再用旧的 7 地区 / 6 类别。
// ============================================================

export const QuerySalesArgsSchema = z.object({
  region: z
    .enum(["华东", "华南", "华中", "西北", "全部"])
    .nullish()
    .describe("销售地区(与 DB 一致),如果用户没说则填'全部'"),
  category: z
    .enum(["家具", "办公用品", "电子产品", "全部"])
    .nullish()
    .describe("商品类别(与 DB 一致),如果用户没说则填'全部'"),
  timeRange: z
    .enum(["今天", "本月", "上月", "今年", "全部"])
    .nullish()
    .describe("时间范围，默认为'全部'"),
  groupBy: z
    .enum(["region", "category", "month", "none"])
    .nullish()
    .describe(
      "聚合维度。按地区填region，按类别填category，按月份趋势填month，不填none",
    ),
});

export const GenChartArgsSchema = z.object({
  region: z
    .enum(["华东", "华南", "华中", "西北", "全部"])
    .nullish()
    .describe("销售地区(与 DB 一致)"),
  category: z
    .enum(["家具", "办公用品", "电子产品", "全部"])
    .nullish()
    .describe("商品类别(与 DB 一致)"),
  timeRange: z
    .enum(["今天", "本月", "上月", "今年", "全部"])
    .nullish()
    .describe("时间范围。若用户未明确说且 groupBy 含时间维度,推荐'近 30 天'(在 SQL 层面兜底默认)"),
  groupBy: z
    .enum([
      // query_sales 维度 (固定聚合,性能好)
      "region",
      "category",
      "month",
      // query_details 维度 (任意维度,见 query-details.tool.ts)
      "product",
      "customer",
      "state",
      "city",
      "subCategory",
      "segment",
      "shipMode",
      "day",
      "week",
      "quarter",
      // 不聚合
      "none",
    ])
    .nullish()
    .describe(
      "分组维度。地区填region,类别填category,月度趋势填month,周/日/季填week/day/quarter,产品/客户/州/市/子类/客户类型/运输方式分别填对应值,不聚合填none",
    ),
  metrics: z
    .array(QueryDetailsMetricSchema)
    // [M10-Bug F 修复] 之前 .min(1) 太严,LangChain 校验 LLM 传空数组时直接抛
    //   "Received tool input did not match expected schema",根本进不到 gen-chart.tool.ts 兜底。
    //   去掉 .min(1) 允许空数组,gen-chart.tool.ts 内部 metricList 兜底 (M9-Bug D 修复)。
    .nullish()
    .describe(
      "要计算的指标数组,默认 [sales]。多 metric 触发多 series + 双 Y 轴(异量纲时)。discount=平均折扣率,orderCount=订单数(去重)。允许空数组,后端兜底为 [sales]",
    ),
  chartType: z
    // [M13-V2] V2 允许 chartType 含 "area" (内部映射为 line + areaStyle,前端不感知)
    .enum([...ECHART_SERIES_TYPES, "area"] as const)
    .nullish()
    .describe(
      "图表类型(30 种 ECharts series + 'area' 等价 line + areaStyle,严格匹配枚举):line|bar|pie|scatter|area|map|heatmap|treemap|sankey|funnel|gauge|radar|parallel|sunburst|boxplot|candlestick|graph|tree|themeRiver|pictorialBar|bar3D|scatter3D|surface3D|map3D|line3D|points3D|lines3D|liquidFill|wordCloud|custom",
    ),
  topN: z
    .number()
    .int()
    .min(1)
    .max(100)
    .nullish()
    .describe(
      "Top-N 截断,默认 10。groupBy='none' 时强制 ≤ 50。SQL 层面另有 LIMIT 1000 兜底保护",
    ),

  // ─────────────────────────────────────────────────────────────
  // [M5-Patch-Fix] Planner 可显式传样式/地图/布局,避免 inner LLM 提取失败
  // 与 ChartIntentSchema 新增字段一一对应;Planner 显式值在 inner fillIntentFields 中
  //   优先级最高,不会覆盖。
  // ─────────────────────────────────────────────────────────────
  colorPalette: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .nullish()
    .describe(
      "用户指定的颜色数组 (如 ['#800080'] 表示紫色;['#ff0000','#00ff00'] 表示红绿)。" +
        "中文颜色名 (红/蓝/紫/金黄/...) 自动转 hex。" +
        "**若用户提到具体颜色、颜色系、色调,必须传此参数**,后端会注入到图表 option.color。" +
        "未指定不传,前端 ECharts 主题自动取色。",
    ),
  mapType: z
    .string()
    .min(1)
    .max(50)
    .nullish()
    .describe(
      "地图类型标识: 'china' (默认) / 'world' / 'usa' / 'prov-<拼音>'。" +
        "**若用户提到某国/省份/世界/中国,必须传此参数** (例 'prov-guangdong' 表示广东省)。",
    ),
  layout: z
    .enum(["inline", "fullscreen"])
    .nullish()
    .describe(
      "布局模式: 'inline' (默认) / 'fullscreen' (用户说'全屏展示'/'大屏'/'铺满')。",
    ),
});

// ============================================================
// QueryDetails - 明细 / Top-N / 利润分析
// 与 query_sales 是互补关系:query_sales 只做 month/category/region 三种聚合
// (固定 schema 性能好),query_details 支持任意维度 + 任意 metric + Top-N
// ============================================================

export const QueryDetailsArgsSchema = z.object({
  metrics: z
    .array(QueryDetailsMetricSchema)
    .default(["sales", "quantity", "profit"])
    .describe("要计算的指标,默认 [sales, quantity, profit]。discount 为平均折扣率,orderCount 为订单数(去重)"),
  groupBy: QueryDetailsGroupBySchema.nullish()
    .describe("聚合维度:product=按产品, customer=按客户, state/city=按地理, subCategory=按子类别, segment=按客户类型, shipMode=按运输方式, day/week/quarter=按时间, none=原始行(limit ≤ 50)"),
  filters: z
    .object({
      region: z.string().nullish().describe("销售地区筛选,如 '华东'"),
      category: z.string().nullish().describe("商品类别,如 '电子产品'"),
      subCategory: z.string().nullish().describe("子类别,如 '手机'"),
      state: z.string().nullish().describe("州/省,如 'California'"),
      segment: z.string().nullish().describe("客户类型,如 'Consumer'"),
      shipMode: z.string().nullish().describe("运输方式,如 'Second Class'"),
      dateFrom: z.string().nullish().describe("ISO 日期起点, e.g. 2017-01-01"),
      dateTo: z.string().nullish().describe("ISO 日期终点, e.g. 2017-12-31"),
    })
    .nullish()
    .describe("筛选条件,未指定即全部"),
  topN: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("返回前 N 条,默认 10,最大 100。groupBy='none' 时强制 ≤ 50"),
  order: z
    .enum(["desc", "asc"])
    .default("desc")
    .describe("排序方向"),
  sortBy: QueryDetailsMetricSchema.nullish()
    .describe("排序字段,默认 = metrics[0]"),
});

export const GenerateInsightArgsSchema = z.object({
  question: z
    .string()
    .describe("用户的原始问题,用于分析上下文"),
  data: z
    .any()
    .optional()
    .describe(
      "要分析的数据集(通常是 query_sales / query_details / gen_chart 的返回)。**若留空,系统会自动从最近一条工具结果补全**",
    ),
  context: z
    .string()
    .nullish()
    .describe("会话中其他相关工具调用的简短摘要"),
  focus: z
    .enum(["general", "trend", "anomaly", "opportunity", "risk"])
    .nullish()
    .describe("聚焦方向,默认 general"),
});

// ============================================================
// [M13-V2] ChartIntentSchema — LLM 仅输出最小意图 JSON
// ------------------------------------------------------------
// 协议反转: chart.agent.ts 不再让 LLM 输出完整 EChartsOption。
// LLM 只输出 chartType/xField/yField/groupBy/metrics,ChartAssembler 按意图 + rows 100% 装配。
// ============================================================

export const ChartIntentSchema = z.object({
  chartType: z
    .enum([...ECHART_SERIES_TYPES, "area"] as const)
    .describe(
      "图表系列类型 (30 种 ECharts series + 'area' 等价 line + areaStyle),必须严格匹配下方 ENUM",
    ),
  xField: z
    .string()
    .min(1)
    .default("name")
    .describe("x 轴字段名,数据中存在的字符串/时间字段 (默认 'name')"),
  yField: z
    .string()
    .min(1)
    .describe(
      "y 轴字段名,必填,数值字段 (如 sales / quantity / profit / discount / orderCount)",
    ),
  groupBy: z
    .enum([
      "region",
      "category",
      "month",
      "product",
      "customer",
      "state",
      "city",
      "subCategory",
      "segment",
      "shipMode",
      "day",
      "week",
      "quarter",
      "none",
    ])
    .optional()
    .describe(
      "用户语义上的分组维度,辅助 title 生成;若用户未明示可省略,默认用 ctx.groupBy",
    ),
  metrics: z
    .array(QueryDetailsMetricSchema)
    .optional()
    .describe(
      "用到的指标数组,若 LLM 识别到多个指标请填入;若 ctx.metrics 已有可省略",
    ),

  // ─────────────────────────────────────────────────────────────
  // [M5-Patch] 样式与布局扩展
  // - colorPalette: 用户指定的颜色数组 (hex 或 named color)
  // - mapType: 地图类型标识 (china/world/usa/prov-<拼音>)
  // - layout: 布局模式 (inline 默认 / fullscreen 全屏)
  // 全部 optional,LLM 不识别时不填,前端走默认主题/默认 china/inline
  // ─────────────────────────────────────────────────────────────
  colorPalette: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .optional()
    .describe(
      "用户指定的颜色数组 (如 ['#ff0000','#00ff00'] 或 ['red','blue'])。" +
        "若用户指定颜色(如 '用蓝绿色'、'红色系'),转化为 hex/named color 数组传回。" +
        "未指定不传,前端 ECharts 主题自动取色。",
    ),
  mapType: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "地图类型标识,如 'china'(默认)、'world'、'usa'、'prov-guangdong'。" +
        "若用户提到某省(如 '看广东省的分布'),设 'prov-<拼音>'。" +
        "未指定则默认 'china'。",
    ),
  layout: z
    .enum(["inline", "fullscreen"])
    .optional()
    .describe(
      "布局模式。若用户说'全屏展示'/'大屏显示'/'铺满',设 'fullscreen';默认 'inline'。" +
        "全屏模式下图表占满消息气泡宽度 (无 max-width 限制)。",
    ),
});

export type ChartIntent = z.infer<typeof ChartIntentSchema>;
