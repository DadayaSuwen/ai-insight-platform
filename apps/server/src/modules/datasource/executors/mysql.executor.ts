import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import { createPool, type Pool } from "mysql2/promise";
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
 * [Sprint 4 / V3] MySQL 数据源执行器 — 完整实装
 *
 * 与 PgExecutor 镜像,但使用 mysql2/promise 替代 Kysely + pg.Pool。
 *
 * 架构师避坑 #1:
 *   - mysql2 的 pool 不会自动释放 → 实现 OnModuleDestroy 调 pool.end()
 *   - 每次查询用 pool.execute(sql, params) 参数化(不暴露 query(sql))
 *
 * 安全:
 *   - introspect 走 information_schema.columns / .statistics
 *   - sample values 仅 VARCHAR/TEXT/ENUM/TIMESTAMP
 *   - executeRaw 仍走 sql-guard(正则黑名单 + LIMIT 1000 强制包裹)
 *   - identifier 严格校验 [a-zA-Z_][a-zA-Z0-9_]{0,62},不通过则跳过该列
 *     (防止 information_schema 中混入 schema_name/column_name 含特殊字符)
 *
 * 不支持的事:
 *   - schema 跨库(Sprint 4 仅 default db,不复用 PG 的 schema 概念)
 *   - SHOW GRANTS(权限检查由 DB 用户 ai_insight_ro 保证)
 */
@Injectable()
export class MysqlExecutor implements DataSourceExecutor, OnModuleDestroy {
  private readonly logger = new Logger(MysqlExecutor.name);
  private readonly pool: Pool;

  constructor(
    readonly dataSourceId: string,
    readonly config: ConnectionConfig & { type: "mysql" },
    poolSize: number = 5,
  ) {
    this.pool = createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      waitForConnections: true,
      connectionLimit: poolSize, // [Sprint 5] 由 ExecutorFactory 注入
      connectTimeout: 5_000,
    });
    this.logger.log(
      `MysqlExecutor[${dataSourceId}] pool created → ${config.host}:${config.port}/${config.database}`,
    );
  }

  /**
   * [Sprint 4] 模块销毁时关 pool(架构师避坑 #1:mysql2 pool 不会自动释放)。
   * 注意:executor 是 factory.new 创建的,理论上不应 long-lived;但万一
   * 注入到 DI 容器(DatasourceModule),也要兜底关 pool。
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.pool.end();
      this.logger.log(`MysqlExecutor[${this.dataSourceId}] pool ended`);
    } catch (err) {
      this.logger.warn(
        `MysqlExecutor[${this.dataSourceId}] pool.end() threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async introspect(): Promise<MetadataSnapshot> {
    const start = Date.now();
    const dbName = this.config.database;

    // 1. 列 + 数据类型
    // 跳过元数据表 / 系统 schema
    const [colsRows] = (await this.pool.execute(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [dbName],
    )) as [Array<Record<string, string>>, unknown];

    // 2. 主键
    const [pkRows] = (await this.pool.execute(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND INDEX_NAME = 'PRIMARY'`,
      [dbName],
    )) as [Array<Record<string, string>>, unknown];

    // 3. FK (information_schema.KEY_COLUMN_USAGE 联合 REFERENCED_TABLE_NAME)
    const [fkRows] = (await this.pool.execute(
      `SELECT TABLE_NAME, COLUMN_NAME,
              REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [dbName],
    )) as [Array<Record<string, string>>, unknown];

    const tableMap = new Map<string, TableMetadata>();
    for (const r of colsRows) {
      const t = tableMap.get(r.TABLE_NAME) ?? {
        name: r.TABLE_NAME,
        columns: [],
        fkHints: [],
      };
      const col: ColumnMetadata = {
        name: r.COLUMN_NAME,
        rawType: r.DATA_TYPE,
        semanticRole: "identifier",
        cardinality: -1,
        sampleValues: [],
        isPrimaryKey: false,
        isForeignKey: false,
      };
      t.columns.push(col);
      tableMap.set(r.TABLE_NAME, t);
    }
    for (const r of pkRows) {
      const t = tableMap.get(r.TABLE_NAME);
      const col = t?.columns.find(c => c.name === r.COLUMN_NAME);
      if (col) col.isPrimaryKey = true;
    }
    for (const r of fkRows) {
      const t = tableMap.get(r.TABLE_NAME);
      const col = t?.columns.find(c => c.name === r.COLUMN_NAME);
      if (col) {
        col.isForeignKey = true;
        col.referencesTable = r.REFERENCED_TABLE_NAME;
        col.referencesColumn = r.REFERENCED_COLUMN_NAME;
      }
    }

    await this.enrichSampleValues(tableMap, dbName);

    const durationMs = Date.now() - start;
    this.logger.log(
      `MysqlExecutor[${this.dataSourceId}] introspected ${tableMap.size} tables in ${durationMs}ms`,
    );

    return {
      dataSourceId: this.dataSourceId,
      fetchedAt: new Date().toISOString(),
      tables: Array.from(tableMap.values()),
      tokenEstimate: 0,
      truncated: false,
    };
  }

  async execute(_intent: QueryIntent): Promise<QueryResult> {
    throw new Error(
      "MysqlExecutor.execute(intent) is implemented in QueryGateway layer",
    );
  }

  async executeRaw(rawSql: string): Promise<QueryResult> {
    const start = Date.now();
    const guard = guardSql(rawSql);
    if (guard.rejected) {
      throw new Error(`SQL rejected by guard: ${guard.reason}`);
    }
    try {
      // [架构师避坑 #1] 用 .execute(sql) 参数化路径,不暴露 query
      const [rows, fields] = (await this.pool.execute(guard.sql)) as [
        Array<Record<string, unknown>>,
        unknown,
      ];
      const durationMs = Date.now() - start;
      const normalized = rows.map(r => normalizeRow(r));
      return {
        rows: normalized,
        rowCount: normalized.length,
        truncated: guard.modified && normalized.length >= 1000,
        durationMs,
      };
    } catch (err) {
      this.logger.error(
        `MysqlExecutor[${this.dataSourceId}] executeRaw failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.pool.execute("SELECT 1");
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
    try {
      await this.pool.end();
    } catch (err) {
      this.logger.debug(
        `MysqlExecutor[${this.dataSourceId}] pool.end() threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ============================================================
  // helpers
  // ============================================================

  private async enrichSampleValues(
    tableMap: Map<string, TableMetadata>,
    dbName: string,
  ): Promise<void> {
    for (const t of tableMap.values()) {
      for (const c of t.columns) {
        if (!isSampleableText(c.rawType)) continue;
        if (!safeMysqlId(t.name) || !safeMysqlId(c.name)) continue;

        try {
          // mysql2 的 execute 不接受表名/列名作为参数,用 ? 占位反引号包裹;
          // 这里已经 safeMysqlId 过滤过,反引号防注入足够
          const [rows] = (await this.pool.execute(
            `SELECT DISTINCT \`${c.name}\` AS sample FROM \`${dbName}\`.\`${t.name}\` WHERE \`${c.name}\` IS NOT NULL LIMIT 100`,
          )) as [Array<{ sample: unknown }>, unknown];
          c.sampleValues = rows
            .map(row => String(row.sample ?? ""))
            .filter(s => s.length > 0 && s.length <= 64)
            .slice(0, 3);
          c.cardinality = rows.length;
        } catch (err) {
          this.logger.debug(
            `MysqlExecutor[${this.dataSourceId}] sample failed for ${t.name}.${c.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
}

/** 哪些 rawType 适合 sample(text / 时间 / 枚举,跳过 numeric) */
function isSampleableText(rawType: string): boolean {
  const t = rawType.toLowerCase();
  return /\b(text|char|varchar|uuid|enum|date|time|timestamp|datetime|year)\b/.test(
    t,
  );
}

/** MySQL identifier 安全校验: [a-zA-Z_][a-zA-Z0-9_]{0,62} */
function safeMysqlId(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name);
}

/** mysql2 行归一化:Date → ISO,bigint → number,其余 toString */
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
    } else if (Buffer.isBuffer(v)) {
      out[k] = v.toString("utf8");
    } else {
      out[k] = String(v);
    }
  }
  return out;
}