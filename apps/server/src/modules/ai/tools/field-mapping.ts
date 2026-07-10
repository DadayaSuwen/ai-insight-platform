import type { MetadataSnapshot } from "@workspace/types";

/**
 * [Sprint 5.7] 构建物理名 → 中文名 映射表
 *
 * 从 MetadataSnapshot 中提取每列的 chineseName，
 * 用于 tool_result 的 fieldMapping 字段，前端据此渲染中文表头和图例。
 *
 * @param snapshot  当前数据源的元数据快照
 * @param tableName 查询的目标表
 * @param metrics   指标别名列表（用于映射聚合结果列名）
 * @returns { "emp_name": "员工姓名", "late_cnt": "迟到次数", ... }
 */
export function buildFieldMapping(
  snapshot: MetadataSnapshot,
  tableName: string,
  metrics?: string[],
): Record<string, string> {
  const table = snapshot.tables.find((t) => t.name === tableName);
  if (!table) return {};

  const mapping: Record<string, string> = {};

  for (const col of table.columns) {
    if (col.chineseName && col.chineseName !== col.name) {
      mapping[col.name] = col.chineseName;
    }
  }

  // metrics 别名也尝试映射：如果 alias 正好是某个列的 name，用该列的中文名
  if (metrics) {
    for (const m of metrics) {
      if (!mapping[m]) {
        const col = table.columns.find((c) => c.name === m || c.chineseName === m);
        if (col?.chineseName) {
          mapping[m] = col.chineseName;
        }
      }
    }
  }

  return mapping;
}
