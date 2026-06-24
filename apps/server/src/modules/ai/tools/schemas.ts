import { z } from "zod";

// ============================================================
// Tool Argument Schemas (输入参数)
// ============================================================

export const QuerySalesArgsSchema = z.object({
  region: z
    .enum(["华东", "华北", "华南", "华中", "东北", "西北", "西南", "全部"])
    .nullish() // ← 换成 .nullish()
    .describe("销售地区，如果用户没说则填'全部'"),
  category: z
    .enum(["电子产品", "服装", "食品", "家居", "图书", "运动", "全部"])
    .nullish()
    .describe("商品类别，如果用户没说则填'全部'"),
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
    .enum(["华东", "华北", "华南", "华中", "东北", "西北", "西南", "全部"])
    .nullish()
    .describe("销售地区"),
  category: z
    .enum(["电子产品", "服装", "食品", "家居", "图书", "运动", "全部"])
    .nullish()
    .describe("商品类别"),
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
