import type { DataSourceType, MetadataSnapshot } from "@workspace/types";

/**
 * [Sprint 2] QueryGateway 方言适配器
 *
 * 不同数据源类型的 SQL 方言差异(架构师避坑 #2):
 *   - Postgres:    DATE_TRUNC('month', col), LIMIT N
 *   - MySQL:       DATE_FORMAT(col, '%Y-%m-01'), LIMIT N OFFSET M
 *   - DuckDB:      date_trunc('month', col), LIMIT N
 *
 * Sprint 2 仅实装 Postgres 路径。MySQL/DuckDB stub 留接口,Sprint 4+ 补。
 *
 * 设计:每个 dialect 暴露一个 translate(intent, snapshot) → SQL 函数。
 * gateway.executeIntent 按 dataSource.type 分发到对应 dialect。
 */

export interface SqlDialect {
  type: DataSourceType;
  /**
   * 把 QueryIntent 翻译成物理 SQL。
   * 返回的 SQL 还要走 sql-guard + LIMIT 1000 包裹。
   */
  translate(intent: QueryIntentArgs, snapshot: MetadataSnapshot): {
    sql: string;
    /** 把 alias 映射到列名,用于 chartHelper / 前端 */
    columnAliases: Record<string, string>;
  };
}

/**
 * QueryIntent args (来自工具 LLM 调用,非 packages/types 中的完整版,
 * 这里只用到 gateway 翻译所需的字段子集)
 */
export interface QueryIntentArgs {
  table: string;
  groupBy: string[];
  metrics: Array<{
    column: string;
    agg: "SUM" | "AVG" | "COUNT" | "COUNT_DISTINCT" | "MIN" | "MAX";
    alias: string;
    label?: string;
  }>;
  filters: Array<{
    column: string;
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "IN" | "LIKE" | "BETWEEN";
    value: string | number | Array<string | number>;
  }>;
  orderBy?: { column: string; direction: "ASC" | "DESC" };
  limit: number;
}

// ============================================================
// PostgresDialect — Sprint 2 实装
// ============================================================
class PostgresDialect implements SqlDialect {
  readonly type: DataSourceType = "postgres";

  translate(
    intent: QueryIntentArgs,
    _snapshot: MetadataSnapshot,
  ): { sql: string; columnAliases: Record<string, string> } {
    const parts: string[] = [];
    const columnAliases: Record<string, string> = {};

    // SELECT clause
    const selectParts: string[] = [];
    for (const g of intent.groupBy) {
      selectParts.push(`"${g}"`);
    }
    for (const m of intent.metrics) {
      const aggFn = m.agg;
      const expr = `${aggFn}("${m.column}")`;
      const aliased = `${expr} AS "${m.alias}"`;
      selectParts.push(aliased);
      columnAliases[m.alias] = m.column;
    }
    parts.push(`SELECT ${selectParts.join(", ")}`);
    parts.push(`FROM "${intent.table}"`);

    // WHERE
    if (intent.filters.length > 0) {
      const whereClauses = intent.filters.map(f => translateFilter(f));
      parts.push(`WHERE ${whereClauses.join(" AND ")}`);
    }

    // GROUP BY
    if (intent.groupBy.length > 0 && intent.metrics.length > 0) {
      parts.push(
        `GROUP BY ${intent.groupBy.map(g => `"${g}"`).join(", ")}`,
      );
    }

    // ORDER BY
    if (intent.orderBy) {
      parts.push(
        `ORDER BY "${intent.orderBy.column}" ${intent.orderBy.direction}`,
      );
    } else if (intent.metrics.length > 0) {
      // 默认按首个 metric 倒序
      parts.push(`ORDER BY "${intent.metrics[0].alias}" DESC`);
    }

    // LIMIT
    parts.push(`LIMIT ${Math.min(intent.limit, 1000)}`);

    return {
      sql: parts.join("\n"),
      columnAliases,
    };
  }
}

// ============================================================
// MySQLDialect — Sprint 4 实装
// ============================================================
//
// 与 PostgresDialect 关键差异(架构师避坑 #2):
//   1. 日期截断:DATE_FORMAT(col, '%Y-%m-01') 替代 DATE_TRUNC('month', col)
//   2. 标识符:反引号 `` `col` `` 替代双引号 `"col"`
//   3. LIMIT 语法:相同(MySQL 8.0+ 支持 LIMIT N OFFSET M,语义一致)
//   4. 字符串字面量:用单引号 `'val'`,与 PG 一致
//
// 注:本 dialect 当前不直接产 CAST 表达式(Sprint 4 QueryIntent 阶段只
// 描述 metric agg);CSV 类型覆写在 upload.register 阶段用 TRY_CAST 生成。
class MysqlDialect implements SqlDialect {
  readonly type: DataSourceType = "mysql";

  translate(
    intent: QueryIntentArgs,
    _snapshot: MetadataSnapshot,
  ): { sql: string; columnAliases: Record<string, string> } {
    const parts: string[] = [];
    const columnAliases: Record<string, string> = {};

    // SELECT clause — MySQL 用反引号
    const selectParts: string[] = [];
    for (const g of intent.groupBy) {
      selectParts.push(`\`${g}\``);
    }
    for (const m of intent.metrics) {
      const aggFn = m.agg;
      const expr = `${aggFn}(\`${m.column}\`)`;
      const aliased = `${expr} AS \`${m.alias}\``;
      selectParts.push(aliased);
      columnAliases[m.alias] = m.column;
    }
    parts.push(`SELECT ${selectParts.join(", ")}`);
    parts.push(`FROM \`${intent.table}\``);

    // WHERE
    if (intent.filters.length > 0) {
      const whereClauses = intent.filters.map(f => translateFilterMysql(f));
      parts.push(`WHERE ${whereClauses.join(" AND ")}`);
    }

    // GROUP BY — MySQL 接受反引号
    if (intent.groupBy.length > 0 && intent.metrics.length > 0) {
      parts.push(
        `GROUP BY ${intent.groupBy.map(g => `\`${g}\``).join(", ")}`,
      );
    }

    // ORDER BY
    if (intent.orderBy) {
      parts.push(
        `ORDER BY \`${intent.orderBy.column}\` ${intent.orderBy.direction}`,
      );
    } else if (intent.metrics.length > 0) {
      parts.push(`ORDER BY \`${intent.metrics[0].alias}\` DESC`);
    }

    // LIMIT — MySQL 8.0+ 接受 LIMIT N
    parts.push(`LIMIT ${Math.min(intent.limit, 1000)}`);

    return {
      sql: parts.join("\n"),
      columnAliases,
    };
  }
}

/**
 * [Sprint 3] DuckDB 方言适配器
 *
 * DuckDB 与 PG 95% 一致:
 *   - date_trunc('month', col)  ← 相同函数名(架构师避坑 #2)
 *   - LIMIT N  ← 相同
 *   - FILTER (WHERE ...)        ← DuckDB 支持
 *   - TRY_CAST(col AS TYPE)     ← DuckDB 独有,容错 CAST(架构师提到:
 *                                  CSV 脏数据时 TRY_CAST 比 CAST 更稳)
 *
 * 我们的 QueryIntent 当前不直接产出 CAST 表达式(intent 阶段只描述
 * metric agg,如 SUM(col) / COUNT(*)),所以 TRY_CAST 暂时不在 SQL 中显式
 * 出现 — 但 export 一个 helper 让上层(如 upload 时校验)在需要时调用。
 */
export class DuckDbDialect implements SqlDialect {
  readonly type: DataSourceType = "duckdb-csv";

  translate(
    intent: QueryIntentArgs,
    _snapshot: MetadataSnapshot,
  ): { sql: string; columnAliases: Record<string, string> } {
    const parts: string[] = [];
    const columnAliases: Record<string, string> = {};

    // SELECT clause
    const selectParts: string[] = [];
    for (const g of intent.groupBy) {
      selectParts.push(`"${g}"`);
    }
    for (const m of intent.metrics) {
      const aggFn = m.agg;
      // DuckDB 不接受 double-quoted alias 包含特殊字符,但 Zod 已校验 alias 为
      // snake_case,所以双引号安全
      const expr = `${aggFn}("${m.column}")`;
      const aliased = `${expr} AS "${m.alias}"`;
      selectParts.push(aliased);
      columnAliases[m.alias] = m.column;
    }
    parts.push(`SELECT ${selectParts.join(", ")}`);
    parts.push(`FROM "${intent.table}"`);

    // WHERE
    if (intent.filters.length > 0) {
      const whereClauses = intent.filters.map(f => translateFilter(f));
      parts.push(`WHERE ${whereClauses.join(" AND ")}`);
    }

    // GROUP BY
    if (intent.groupBy.length > 0 && intent.metrics.length > 0) {
      parts.push(
        `GROUP BY ${intent.groupBy.map(g => `"${g}"`).join(", ")}`,
      );
    }

    // ORDER BY
    if (intent.orderBy) {
      parts.push(
        `ORDER BY "${intent.orderBy.column}" ${intent.orderBy.direction}`,
      );
    } else if (intent.metrics.length > 0) {
      parts.push(`ORDER BY "${intent.metrics[0].alias}" DESC`);
    }

    // LIMIT — DuckDB 也接受 LIMIT N
    parts.push(`LIMIT ${Math.min(intent.limit, 1000)}`);

    return {
      sql: parts.join("\n"),
      columnAliases,
    };
  }
}

/**
 * DuckDB TRY_CAST helper — 供 upload 时的预校验 / 脏数据 CSV 容错使用。
 *
 * 架构师避坑:CSV 脏数据(如金额列混 "一百元")DuckDB 默认 CAST 会抛错,
 * 用 TRY_CAST 返回 NULL 让查询继续。
 */
export function duckTryCast(column: string, targetType: string): string {
  return `TRY_CAST("${column}" AS ${targetType})`;
}

// ============================================================
// 分发
// ============================================================
export function getDialect(type: DataSourceType): SqlDialect {
  switch (type) {
    case "postgres":
      return new PostgresDialect();
    case "mysql":
      return new MysqlDialect();
    case "duckdb-csv":
      return new DuckDbDialect();
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown dialect type: ${String(_exhaustive)}`);
    }
  }
}

// ============================================================
// helpers
// ============================================================

function translateFilter(f: QueryIntentArgs["filters"][number]): string {
  const col = `"${f.column}"`;
  switch (f.op) {
    case "=":
    case "!=":
    case ">":
    case "<":
    case ">=":
    case "<=": {
      const v = Array.isArray(f.value) ? f.value[0] : f.value;
      if (typeof v !== "string" && typeof v !== "number") {
        throw new Error(
          `Operator ${f.op} expects scalar value, got ${typeof v}`,
        );
      }
      return `${col} ${f.op} ${quoteValue(v)}`;
    }
    case "LIKE": {
      const v = Array.isArray(f.value) ? f.value[0] : f.value;
      if (typeof v !== "string") {
        throw new Error(`LIKE expects string, got ${typeof v}`);
      }
      return `${col} LIKE ${quoteValue(v)}`;
    }
    case "IN": {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      return `${col} IN (${arr.map(quoteValue).join(", ")})`;
    }
    case "BETWEEN": {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      if (arr.length !== 2) {
        throw new Error(`BETWEEN expects 2 values, got ${arr.length}`);
      }
      return `${col} BETWEEN ${quoteValue(arr[0])} AND ${quoteValue(arr[1])}`;
    }
  }
}

function quoteValue(v: string | number): string {
  if (typeof v === "number") return String(v);
  // 字符串值 — 防注入:拒绝包含 quote/semi 的值(LLM 应通过 Zod
  // 校验,这里再守一层)
  if (/['";\\]/.test(v)) {
    throw new Error(
      `Filter value contains forbidden chars (quote/semi/backslash): "${v}"`,
    );
  }
  return `'${v}'`;
}

/**
 * MySQL 专用 filter 翻译:反引号替代双引号。
 */
function translateFilterMysql(f: QueryIntentArgs["filters"][number]): string {
  const col = `\`${f.column}\``;
  switch (f.op) {
    case "=":
    case "!=":
    case ">":
    case "<":
    case ">=":
    case "<=": {
      const v = Array.isArray(f.value) ? f.value[0] : f.value;
      if (typeof v !== "string" && typeof v !== "number") {
        throw new Error(
          `Operator ${f.op} expects scalar value, got ${typeof v}`,
        );
      }
      return `${col} ${f.op} ${quoteValue(v)}`;
    }
    case "LIKE": {
      const v = Array.isArray(f.value) ? f.value[0] : f.value;
      if (typeof v !== "string") {
        throw new Error(`LIKE expects string, got ${typeof v}`);
      }
      return `${col} LIKE ${quoteValue(v)}`;
    }
    case "IN": {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      return `${col} IN (${arr.map(quoteValue).join(", ")})`;
    }
    case "BETWEEN": {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      if (arr.length !== 2) {
        throw new Error(`BETWEEN expects 2 values, got ${arr.length}`);
      }
      return `${col} BETWEEN ${quoteValue(arr[0])} AND ${quoteValue(arr[1])}`;
    }
  }
}