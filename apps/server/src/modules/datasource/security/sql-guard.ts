/**
 * [Sprint 1 / V3 架构师铁律 #3] SQL 安全护栏 — AST 版
 * --------------------------------------------------------------
 * 所有 QueryGateway 发出的 SQL 必经此护栏后再到 executor。
 *
 * [Fix-3 Task 3.5] 用 node-sql-parser 替代原正则黑名单:
 *   - 正则黑名单可被 WITH/CTE/CALL/DO/COPY/UNION/注释等绕过
 *   - AST 解析后白名单只允许 SELECT,递归检查子查询不含修改操作
 *   - 强制包裹 LIMIT 1000
 *
 * 函数签名保持向后兼容 (guardSql(sql, opts) → SqlGuardResult),
 * 4 个调用方 (pg/mysql/duckdb executor + query-gateway) 零修改。
 */
import { Parser } from "node-sql-parser";

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

/** 默认最大返回行数 — 与计划文档一致 */
export const DEFAULT_MAX_ROWS = 1000;

export interface SqlGuardOptions {
  /** 强制包裹 LIMIT 的上限,默认 1000 */
  maxRows?: number;
  /** 跳过 LIMIT 强制包裹 (例如 SHOW/EXPLAIN) */
  skipLimit?: boolean;
}

const parser = new Parser();

/**
 * 递归检查 AST 节点不含修改型操作
 */
function ensureReadOnly(node: unknown, depth = 0): void {
  if (depth > 50) {
    // 防止栈溢出 (恶意构造极深 AST)
    throw new Error("AST depth exceeds 50");
  }
  if (!node || typeof node !== "object") return;

  const n = node as { type?: string; [k: string]: unknown };

  // 任何非 select 的顶层 type 都拒绝
  if (n.type && n.type !== "select") {
    throw new Error(`disallowed statement type: ${n.type}`);
  }

  // 递归遍历子节点
  for (const key of Object.keys(n)) {
    if (key === "parent" || key === "loc") continue;
    const v = (n as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      for (const item of v) ensureReadOnly(item, depth + 1);
    } else if (v && typeof v === "object") {
      ensureReadOnly(v, depth + 1);
    }
  }
}

/** 已显式包含 LIMIT/FETCH FIRST 等价物 */
const HAS_LIMIT_REGEX = /\bLIMIT\b|\bFETCH\s+FIRST\b/i;

/**
 * 主入口。
 *
 * 用法:
 *   const result = guardSql("SELECT * FROM x");
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

  // 1. AST 解析 + 白名单校验
  let ast: unknown;
  try {
    ast = parser.astify(rawSql, { database: "postgresql" });
  } catch (err) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: `SQL 语法错误: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. 处理多语句
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length > 1) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: "Multi-statement SQL rejected",
    };
  }

  // 3. 递归检查每个语句只读
  try {
    for (const stmt of statements) {
      ensureReadOnly(stmt);
    }
  } catch (err) {
    return {
      sql: rawSql,
      modified: false,
      rejected: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. LIMIT 强制包裹
  if (opts.skipLimit) {
    return { sql: rawSql, modified: false, rejected: false };
  }
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  if (HAS_LIMIT_REGEX.test(rawSql)) {
    return { sql: rawSql, modified: false, rejected: false };
  }
  const trimmed = rawSql.replace(/;\s*$/, "").trimEnd();
  return {
    sql: `${trimmed} LIMIT ${maxRows}`,
    modified: true,
    rejected: false,
  };
}
