/**
 * 表格数值严重程度分级 — 用于在结果表中给"退款率 / 错误率"等列自动着色。
 *
 * 阈值参考原型截图:
 *   2.1% / 1.2% / 0.8% → good(绿)
 *   4.8%               → warn(琥珀)
 *   7.4%               → bad(红)
 *
 * 假设:数值以**百分比**为主(>1 路径)。`val <= 1` 时自动 ×100 当作小数处理。
 */

export type Severity = "good" | "warn" | "bad";

export interface SeverityStyle {
  bg: string;
  fg: string;
}

export const SEVERITY_STYLE: Record<Severity, SeverityStyle> = {
  good: { bg: "var(--sev-good-bg)", fg: "var(--sev-good-fg)" },
  warn: { bg: "var(--sev-warn-bg)", fg: "var(--sev-warn-fg)" },
  bad: { bg: "var(--sev-bad-bg)", fg: "var(--sev-bad-fg)" },
};

/**
 * 列是否为比率列。
 * 优先看中文 label 是否以"率"结尾,其次看英文 key 是否以 rate/refund/error 结尾。
 */
export function isRateColumn(key: string, label?: string): boolean {
  if (label && /率$/.test(label)) return true;
  return /(rate|refund|error)$/i.test(key);
}

/**
 * 把任意 cell value 归一化成百分比数字。
 *   数字 / 数字字符串       → 原值
 *   带 % 的字符串           → 去 %
 *   其他                     → NaN
 */
function toPercent(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const trimmed = val.trim().replace(/%$/, "");
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * 比率列分级。< 3 → good, 3-5 → warn, > 5 → bad。
 * 非数值返回 null(不染色)。
 */
export function rateSeverity(val: unknown): Severity | null {
  const raw = toPercent(val);
  if (!Number.isFinite(raw)) return null;
  // 小数(0~1) → 百分比
  const pct = raw <= 1 ? raw * 100 : raw;
  if (pct < 3) return "good";
  if (pct <= 5) return "warn";
  return "bad";
}