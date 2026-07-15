import { Fragment, type ReactNode } from "react";

/**
 * SQL syntax highlighter for the tool-call card.
 *
 * 单条正则按以下优先级分词,避免冲突:
 *   1. 字符串字面量  '...'   → --sql-string
 *   2. 函数名 + (           → --sql-func     (避免 sum 这种普通列名误染色)
 *   3. 关键字 (含多词)      → --sql-keyword
 *   4. 数字                  → --sql-number
 *   5. 标点                  → --sql-punct
 *
 * 多词关键字(GROUP BY / ORDER BY / LEFT JOIN 等)排在单词关键字前;
 * `\s+` 用 `[ \t]+` 匹配,避免吞掉换行导致跨行 token 拼接。
 * 零宽保护:每次 match 后强制 lastIndex 前移,防止死循环。
 * 容量保护:sql 长度 > 20000 字符直接返回纯文本。
 */

const MULTI_KEYWORDS = [
  "GROUP BY",
  "ORDER BY",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "FULL JOIN",
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
];

const KEYWORDS = [
  "SELECT",
  "FROM",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "ON",
  "WHERE",
  "AND",
  "OR",
  "LIMIT",
  "AS",
  "DISTINCT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "IS",
  "NOT",
  "NULL",
  "IN",
  "BY",
  "DESC",
  "ASC",
  "HAVING",
];

const FUNCTIONS = [
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "ROUND",
  "COALESCE",
  "CAST",
  "DATE_TRUNC",
  "NOW",
  "DATE",
  "EXTRACT",
  "LENGTH",
  "LOWER",
  "UPPER",
  "SUBSTRING",
  "CONCAT",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 单条 master 正则,按优先级排
const pattern = new RegExp(
  [
    "'(?:[^'\\\\]|\\\\.)*'", // 字符串
    `\\b(?:${FUNCTIONS.map(escapeRe).join("|")})\\s*\\(?`, // 函数 + 可能的 (
    `\\b(?:${MULTI_KEYWORDS.map(escapeRe).join("|")})\\b`, // 多词关键字
    `\\b(?:${KEYWORDS.map(escapeRe).join("|")})\\b`, // 单词关键字
    "\\b\\d+(?:\\.\\d+)?\\b", // 数字
    "[(),;.*=<>!+\\-/]", // 标点
  ].join("|"),
  "gi",
);

type Segment = { text: string; kind: "string" | "func" | "keyword" | "number" | "punct" | "plain" };

const COLOR: Record<Exclude<Segment["kind"], "plain">, string> = {
  string: "var(--sql-string)",
  func: "var(--sql-func)",
  keyword: "var(--sql-keyword)",
  number: "var(--sql-number)",
  punct: "var(--sql-punct)",
};

const WEIGHT: Partial<Record<Exclude<Segment["kind"], "plain">, number>> = {
  keyword: 600,
  func: 600,
};

/**
 * 把 SQL 切成高亮 token。容量保护:> 20000 字符直接返回纯文本。
 * 返回 fragment 数组;每个非空白 token 包一层 span,中间穿插原始 plain 段。
 */
export function highlightSql(sql: string): ReactNode {
  if (sql.length > 20000) return sql;

  const segments: Segment[] = [];
  pattern.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    const start = match.index;
    const matched = match[0];

    // 零宽保护
    if (match.index === pattern.lastIndex) pattern.lastIndex++;

    if (start > cursor) {
      segments.push({ text: sql.slice(cursor, start), kind: "plain" });
    }

    let kind: Exclude<Segment["kind"], "plain">;
    if (/^'/.test(matched)) kind = "string";
    else if (
      FUNCTIONS.some((f) => new RegExp(`^${escapeRe(f)}\\s*\\(?$`, "i").test(matched))
    )
      kind = "func";
    else if (
      MULTI_KEYWORDS.some((k) => new RegExp(`^${escapeRe(k)}$`, "i").test(matched.trim()))
    )
      kind = "keyword";
    else if (
      KEYWORDS.some((k) => new RegExp(`^${escapeRe(k)}$`, "i").test(matched.trim()))
    )
      kind = "keyword";
    else if (/^\d/.test(matched)) kind = "number";
    else kind = "punct";

    segments.push({ text: matched, kind });
    cursor = start + matched.length;
  }

  if (cursor < sql.length) {
    segments.push({ text: sql.slice(cursor), kind: "plain" });
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "plain") return <Fragment key={i}>{seg.text}</Fragment>;
        return (
          <span
            key={i}
            style={{
              color: COLOR[seg.kind],
              fontWeight: WEIGHT[seg.kind] ?? 400,
            }}
          >
            {seg.text}
          </span>
        );
      })}
    </>
  );
}