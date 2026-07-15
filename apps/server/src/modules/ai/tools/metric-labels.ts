// ============================================================
// 指标标签映射 — 空 Record, 通用兜底
// ------------------------------------------------------------
// [Fix-4 Task 4.2] 此处不再硬编码任何业务字段名 (Sprint 5.5 已删除 Superstore)。
// 指标中文标签应由 fieldMapping (从 MetadataSnapshot.columnAliases) 动态提供。
// 此文件仅保留类型定义和空 Record, 供 chart.helper 兜底引用。
// ============================================================

/** 指标 key — 改为 string 类型, 不再硬编码枚举 */
export type MetricKey = string;

/** 空表 — 所有标签由 fieldMapping 动态提供 */
export const METRIC_LABELS: Record<MetricKey, string> = {
  // 兜底表为空, 后续接入时通过 fieldMapping 注入
};

/**
 * 获取指标标签 (兜底: 找不到则返回原始 key)
 */
export function getMetricLabel(key: string): string {
  return METRIC_LABELS[key] || key;
}
