import { z } from "zod";

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
    .describe("时间范围"),
  groupBy: z
    .enum(["region", "category", "month"])
    .nullish()
    .describe("分组维度，默认category。如果看趋势必须填month"),
  chartType: z
    .enum(["bar", "line", "pie"])
    .describe("图表类型：柱状图、折线图、饼图"),
});

// ============================================================
// QueryDetails - 明细 / Top-N / 利润分析
// 与 query_sales 是互补关系:query_sales 只做 month/category/region 三种聚合
// (固定 schema 性能好),query_details 支持任意维度 + 任意 metric + Top-N
// ============================================================

export const QueryDetailsMetricSchema = z.enum([
  "sales",
  "quantity",
  "profit",
  "discount",
  "orderCount",
]);

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
