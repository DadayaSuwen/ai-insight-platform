/**
 * [Sprint 1 / V3 架构师铁律 #3] SQL 安全护栏
 * --------------------------------------------------------------
 * 所有 QueryGateway 发出的 SQL 必经此护栏后再到 executor。
 *
 * 防御内容:
 * 1. 黑名单关键字 (case-insensitive, word boundary):
 *    INSERT / UPDATE / DELETE / DROP / MERGE / CREATE / ALTER /
 *    TRUNCATE / GRANT / REVOKE / VACUUM / REINDEX
 * 2. 多语句拒绝: 检测 `;` 后跟非空白字符 (允许末尾 `;` + 空白)
 * 3. SQL 注释拒绝: 拒绝包含 `--` 单行注释 (绕过黑名单常用技巧)
 * 4. 强制包裹 LIMIT 1000: 缺失 LIMIT 子句时追加
 *
 * 权衡说明:
 *   这是正则,不是 AST。对抗 LLM 生成的、由 MetadataService builder
 *   拼接的 SQL 是足够的。若有人手敲 SQL,更稳靠 DB 用户权限
 *   (`ai_insight_ro` SELECT-only,运维侧保障)。
 *
 * [Sprint 3 扩展] DuckDB 走同一接口,通过方言 adapter 维持语义。
 */
export interface SqlGuardResult {
  /** 经过:已强制包裹 LIMIT 的 SQL; 不通过: 原始输入(供 debug 日志) */
  sql: string;
  /** 是否对原始 SQL 做了修改 */
  modified: boolean;
  /** 拒绝时的原因 */
  rejected: boolean;
  /** 拒绝的原因(可读) */
  reason?: string;
}

/**
 * 黑名单关键字:word-boundary 锚定,大小写不敏感,允许在词前有
 * 点/空格/括号/换行等。`DROP` 不会匹配 `droptable` 这种自定义标识符,
 * 但会匹配 `"; DROP TABLE x; --"`。
 */
const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "VACUUM",
  "REINDEX",
];

function buildForbiddenRegex(): RegExp {
  const alt = FORBIDDEN_KEYWORDS.join("|");
  return new RegExp(`\\b(${alt})\\b`, "i");
}

/**
 * 检测 `;` 后跟非空白字符 — 多语句攻击特征。
 * 允许末尾一个 `;` 后跟空白/换行(常见 SELECT ...; 写法)。
 */
const MULTI_STMT_REGEX = /;[^;\s]*\S/;

/** SQL 单行注释 (Postgres/MySQL/SQLite 通用) */
const SQL_COMMENT_REGEX = /--/;

/** 已显式包含 LIMIT/FETCH FIRST 等价物 */
const HAS_LIMIT_REGEX = /\bLIMIT\b|\bFETCH\s+FIRST\b/i;

const FORBIDDEN_RE = buildForbiddenRegex();

/** 默认最大返回行数 — 与计划文档一致 */
export const DEFAULT_MAX_ROWS = 1000;

/**
 * 把缺 LIMIT 的查询强制包裹 LIMIT 1000。
 *
 * 简化策略: 直接在 SQL 末尾 (去尾部 `;`) 追加 `LIMIT N`。
 * 不处理子查询嵌套 (因为 builder 已结构化、无 SQL injection)。
 */
function forceLimit(
  sql: string,
  maxRows: number,
): { sql: string; modified: boolean } {
  if (HAS_LIMIT_REGEX.test(sql)) {
    return { sql, modified: false };
  }
  const trimmed = sql.replace(/;\s*$/, "").trimEnd();
  return { sql: `${trimmed} LIMIT ${maxRows}`, modified: true };
}

export interface SqlGuardOptions {
  /** 强制包裹 LIMIT 的上限,默认 1000 */
  maxRows?: number;
  /** 跳过 LIMIT 强制包裹 (例如 SHOW/EXPLAIN) */
  skipLimit?: boolean;
}

/**
 * 主入口。
 *
 * 用法:
 *   const result = guardSql("SELECT * FROM x; DROP TABLE y; --");
 *   if (result.rejected) throw new Error(result.reason);
 *   executor.executeRaw(result.sql);
 */
export function guardSql(
  rawSql: string,
  opts: SqlGuardOptions = {},
): SqlGuardResult {
  if (typeof rawSql !== "string" || rawSql.trim().length === 0) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: "SQL must be a non-empty string",
    };
  }

  // 1. 黑名单
  if (FORBIDDEN_RE.test(rawSql)) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: `Forbidden keyword detected. Disallowed: ${FORBIDDEN_KEYWORDS.join(", ")}`,
    };
  }

  // 2. 多语句
  if (MULTI_STMT_REGEX.test(rawSql)) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: "Multi-statement SQL rejected (semicolon followed by content)",
    };
  }

  // 3. 注释绕过
  if (SQL_COMMENT_REGEX.test(rawSql)) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: "SQL line comments (--) rejected to prevent blacklist bypass",
    };
  }

  // 4. LIMIT 强制包裹
  if (opts.skipLimit) {
    return { sql: rawSql, modified: false, rejected: false };
  }
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  return { ...forceLimit(rawSql, maxRows), rejected: false };
}
