/**
 * Format a date as a short relative-time string for the sidebar.
 *   < 1min  → "刚刚"
 *   < 1h    → "N 分钟前"
 *   < 24h   → "N 小时前"
 *   < 7d    → "N 天前"
 *   else    → locale date string
 */
export function formatRelative(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());

  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (diff < min) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return date.toLocaleDateString();
}
