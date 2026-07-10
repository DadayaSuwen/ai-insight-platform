import { Injectable, Logger } from "@nestjs/common";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type {
  ColumnMetadata,
  ConnectionConfig,
  MetadataSnapshot,
  TableMetadata,
} from "@workspace/types";
import type { QueryIntent } from "@workspace/types";
import { guardSql } from "../security/sql-guard";
import type {
  DataSourceExecutor,
  QueryResult,
  HealthCheckResult,
} from "./executor.interface";

/**
 * [Sprint 1 / V3] Postgres 数据源执行器。
 *
 * 每个 DataSourceExecutor 拥有独立的 Kysely + pg.Pool,允许:
 *   - 不同 DataSource 连接不同的外部 PG 数据库
 *   - 删除 DataSource 时 dispose() 释放连接
 *
 * Sprint 1 仅完成"连接 + introspect + healthCheck + executeRaw"。
 * execute(intent) Sprint 2 由 QueryGateway 真正使用。
 */
@Injectable()
export class PgExecutor implements DataSourceExecutor {
  private readonly logger = new Logger(PgExecutor.name);
  private readonly kysely: Kysely<unknown>;
  private readonly pool: Pool;

  constructor(
    readonly dataSourceId: string,
    readonly config: ConnectionConfig & { type: "postgres" },
    poolSize: number = 5,
  ) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: poolSize, // [Sprint 5] 由 ExecutorFactory 注入(默认 DB_POOL_SIZE=10)
      connectionTimeoutMillis: 5_000,
    });
    this.kysely = new Kysely<unknown>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
    this.logger.log(
      `PgExecutor[${dataSourceId}] connected to ${config.host}:${config.port}/${config.database}`,
    );
  }

  async introspect(): Promise<MetadataSnapshot> {
    const start = Date.now();
    const schemaName = this.config.schema ?? "public";
    const targetTable = (this.config as Record<string, unknown>).tableName as
      | string
      | undefined;

    // [Sprint 2] 跨数据源守护:跳过明显非业务表的 prefix
    const SKIP_TABLE_PREFIXES = ["_prisma_migrations", "pg_"];

    // [Sprint 5.6] 单表模式:仅内省指定表
    // [Sprint 5.7] 修复:columns 查询无歧义(table_name 唯一),PK/FK 查询 JOIN 多表需限定别名
    const tableFilter = targetTable
      ? `AND table_name = '${targetTable.replace(/'/g, "''")}'`
      : "";
    // PK/FK 查询中 tc 和 kcu/ccu 都有 table_name,必须限定为 tc.table_name
    const tableFilterTC = targetTable
      ? `AND tc.table_name = '${targetTable.replace(/'/g, "''")}'`
      : "";

    // 1. 表 + 列 + 类型 (走 information_schema)
    const colsRows = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = ${schemaName} ${sql.raw(tableFilter)}
      ORDER BY table_name, ordinal_position
    `.execute(this.kysely);

    // 2. 主键
    const pkRows = await sql<{ table_name: string; column_name: string }>`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${schemaName} ${sql.raw(tableFilterTC)}
    `.execute(this.kysely);

    // 3. FK
    const fkRows = await sql<{
      table_name: string;
      column_name: string;
      ref_table: string;
      ref_column: string;
    }>`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name  AS ref_table,
        ccu.column_name AS ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = ${schemaName} ${sql.raw(tableFilterTC)}
    `.execute(this.kysely);

    // 组装到 Map<TableName, TableMetadata>
    const tableMap = new Map<string, TableMetadata>();
    for (const r of colsRows.rows) {
      const t = tableMap.get(r.table_name) ?? {
        name: r.table_name,
        columns: [],
        fkHints: [],
      };
      const col: ColumnMetadata = {
        name: r.column_name,
        rawType: r.data_type,
        semanticRole: "identifier", // Sprint 1 由 metadata-service.inferSemantics() 重写
        cardinality: -1,
        sampleValues: [],
        isPrimaryKey: false,
        isForeignKey: false,
      };
      t.columns.push(col);
      tableMap.set(r.table_name, t);
    }
    for (const r of pkRows.rows) {
      const t = tableMap.get(r.table_name);
      const col = t?.columns.find(c => c.name === r.column_name);
      if (col) col.isPrimaryKey = true;
    }
    for (const r of fkRows.rows) {
      const t = tableMap.get(r.table_name);
      const col = t?.columns.find(c => c.name === r.column_name);
      if (col) {
        col.isForeignKey = true;
        col.referencesTable = r.ref_table;
        col.referencesColumn = r.ref_column;
      }
    }

    // [Sprint 2] 阶段 4 — sample values
    // 对每个 VARCHAR / TEXT / ENUM 列 SELECT DISTINCT col LIMIT 100,
    // 取前 3 个非空值。这样 LLM 在 filter where 阶段能识别
    // 'paid' / 'pending' / 'cancelled' 这类枚举值,不再瞎猜。
    await this.enrichSampleValues(tableMap, schemaName);

    const durationMs = Date.now() - start;
    this.logger.log(
      `PgExecutor[${this.dataSourceId}] introspected ${tableMap.size} tables in ${durationMs}ms`,
    );

    return {
      dataSourceId: this.dataSourceId,
      fetchedAt: new Date().toISOString(),
      tables: Array.from(tableMap.values()),
      tokenEstimate: 0, // 由 token-budget 计算
      truncated: false,
    };
  }

  async execute(_intent: QueryIntent): Promise<QueryResult> {
    // Sprint 1 stub:Sprint 2 由 QueryGateway 调 intent-builder 翻译。
    throw new Error(
      "PgExecutor.execute(intent) is implemented in Sprint 2 (QueryGateway layer)",
    );
  }

  async executeRaw(rawSql: string): Promise<QueryResult> {
    const start = Date.now();
    const guard = guardSql(rawSql);
    if (guard.rejected) {
      throw new Error(`SQL rejected by guard: ${guard.reason}`);
    }
    try {
      const result = await sql`${sql.raw(guard.sql)}`.execute(this.kysely);
      const rows = result.rows.map(r =>
        normalizeRow(r as Record<string, unknown>),
      );
      const affected =
        typeof result.numAffectedRows === "bigint"
          ? Number(result.numAffectedRows)
          : result.numAffectedRows;
      return {
        rows,
        rowCount: affected ?? rows.length,
        truncated:
          guard.modified && rows.length >= (affected ?? rows.length),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      this.logger.error(
        `PgExecutor[${this.dataSourceId}] executeRaw failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await sql`SELECT 1`.execute(this.kysely);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async dispose(): Promise<void> {
    // Kysely.destroy() 内部已调 pool.end()(PostgresDialect) — 重复
    // end 会抛 "Called end on pool more than once"。
    try {
      await this.kysely.destroy();
    } catch (err) {
      this.logger.warn(
        `PgExecutor[${this.dataSourceId}] kysely.destroy() threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.logger.log(`PgExecutor[${this.dataSourceId}] disposed`);
  }

  /**
   * [Sprint 2] sample values 注入
   *
   * 对每张表的 VARCHAR/TEXT/CHAR 列:
   *   SELECT DISTINCT "<col>" FROM "<table>" WHERE "<col>" IS NOT NULL LIMIT 100
   * 取前 3 个值入 sampleValues。Limit 100 防止极低基数字段拖慢 introspect。
   *
   * 安全:table/column 名先过 sanitizePgIdentifier() — 只允许 [a-zA-Z0-9_],
   * 长度 ≤ 63。否则跳过该列(防御 introspection-time SQL injection)。
   */
  private async enrichSampleValues(
    tableMap: Map<string, TableMetadata>,
    schemaName: string,
  ): Promise<void> {
    for (const t of tableMap.values()) {
      for (const c of t.columns) {
        if (!isSampleableText(c.rawType)) continue;
        if (!safePgId(t.name) || !safePgId(c.name)) continue;

        try {
          const r = await sql<{ sample: string }>`
            SELECT DISTINCT ${sql.raw(`"${c.name}"`)} AS sample
            FROM ${sql.raw(`"${schemaName}"."${t.name}"`)}
            WHERE ${sql.raw(`"${c.name}"`)} IS NOT NULL
            LIMIT 100
          `.execute(this.kysely);
          c.sampleValues = r.rows
            .map(row => String(row.sample))
            .filter(s => s.length > 0 && s.length <= 64)
            .slice(0, 3);
        } catch (err) {
          // 防御性:任意列出错不影响整次 introspect
          this.logger.debug(
            `PgExecutor[${this.dataSourceId}] sample failed for ${t.name}.${c.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
}

/**
 * 哪些 rawType 适合 sample:
 *   - text / varchar / char / uuid / enum / date / timestamp
 *   - 跳过 numeric (采样 sales/amount 没意义,反而占 token)
 */
function isSampleableText(rawType: string): boolean {
  const t = rawType.toLowerCase();
  return (
    /\b(text|char|varchar|uuid|enum|date|time|timestamp|datetime)\b/.test(t)
  );
}

/** PG identifier 安全校验: [a-zA-Z_][a-zA-Z0-9_]* , ≤63 字符 */
function safePgId(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name);
}

/**
 * 清洗 Kysely 返回的行:大字段值可能为 Date / bigint 等,
 * 序列化到 JSON 时会被前端 MapType 映射为 timestamp/number。
 *
 * 我们根据 ChartHelper.assemble() 的契约(只接受 number|string)
 * 做安全投影 — Date 转 ISO,bigint 转 number,其余 toString。
 */
function normalizeRow(
  row: Record<string, unknown>,
): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = "";
    } else if (typeof v === "number" || typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "bigint") {
      out[k] = Number(v);
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (typeof v === "boolean") {
      out[k] = v ? 1 : 0;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}
