/**
 * [Sprint 5.7+] 格式化表格/图表中的单元格值
 *
 * - ISO 日期字符串 → YYYY/MM/DD
 * - 数字 → toLocaleString()
 * - 其他 → 原值
 */

/** 检测是否为 ISO 8601 日期时间字符串 */
export function isISODateString(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
  );
}

/** 格式化 ISO 日期为 YYYY/MM/DD */
export function formatDate(v: string): string {
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return v;
  }
}

/** 格式化单个单元格值 */
export function formatCellValue(val: unknown): string {
  if (val == null) return "-";
  if (isISODateString(val)) return formatDate(val);
  if (typeof val === "number") return val.toLocaleString();
  return String(val);
}

/** 格式化行数据中的所有值 (用于图表数据) */
export function formatRowValues(
  row: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(row)) {
    if (isISODateString(v)) {
      out[k] = formatDate(v);
    } else if (typeof v === "number") {
      out[k] = v;
    } else {
      out[k] = v == null ? "-" : String(v);
    }
  }
  return out;
}
