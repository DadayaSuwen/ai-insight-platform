// ============================================================
// 指标标签映射 (与数据源无关的通用指标名称)
// ------------------------------------------------------------
// 从已删除的 dimensions.ts 中提取。
// dimensions.ts 在 Sprint 5.5 被删除，因为其中包含硬编码的
// Superstore SQL builder (SalesOrder/Customer/Product join 链)。
// METRIC_LABELS 和 MetricKey 是通用的指标名 ↔ 中文标签映射，
// 用于 chart.helper.ts 和 chart.agent.ts 的图表标题/轴标签，
// 与具体数据源无关。
// ============================================================

export type MetricKey = "sales" | "quantity" | "profit" | "discount" | "orderCount";

export const METRIC_LABELS: Record<MetricKey, string> = {
  sales: "销售额",
  quantity: "销量",
  profit: "利润",
  discount: "平均折扣率",
  orderCount: "订单数",
};
