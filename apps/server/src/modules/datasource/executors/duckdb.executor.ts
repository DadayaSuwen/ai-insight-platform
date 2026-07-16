import { Injectable, Logger } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  Database as AsyncDatabase,
  Connection as AsyncConnection,
} from "duckdb-async";
import type {
  ColumnMetadata,
  ConnectionConfig,
  MetadataSnapshot,
  TableMetadata,
} from "@workspace/types";
import type { QueryIntent } from "@workspace/types";
import type {
  DataSourceExecutor,
  QueryResult,
  HealthCheckResult,
} from "./executor.interface";
import { slugifyHeaders } from "./slugify";

/**
 * [Sprint 4] CSV 列覆写 — 前端预览页用户修改的列名 / 类型
 *
 * originalName: DuckDB 嗅探的原始列名(来自 CSV header,未 slug 化)
 * newName:      用户想要的列名(显示用,会被 slug 化用于 SQL identifier)
 * type:         "AUTO" / "VARCHAR" / "DECIMAL" / "DATE" / "BOOLEAN"
 *               (AUTO 表示让 DuckDB 推断,其余用 TRY_CAST 显式转)
 */
export interface ColumnOverride {
  originalName: string;
  newName: string;
  type: "AUTO" | "VARCHAR" | "DECIMAL" | "DATE" | "BOOLEAN";
}

/**
 * @deprecated [Sprint 5.6] DuckDB CSV executor — 已退役, 不再用于新 CSV 导入。
 * 仅保留用于向后兼容旧 DuckDB-CSV 数据源。新 CSV 导入走 CsvImportService → PG 表。
 *
 * [Sprint 3 / V3] DuckDB-CSV 数据源执行器 — 完整实装 (已退役)
 *
 * 核心思路:
 *   - 内存 DuckDB 实例(每个 DataSource 一个,DatasourceService 负责 GC)
 *   - 注册时把 CSV 注册为 DuckDB VIEW(view 名 = config.tableAlias 默认 'data')
 *   - introspect() 用 DESCRIBE + LIMIT 100 拿列名 + 样本
 *   - CSV header 中含中文 / 空格 / 特殊字符时,先转成 SQL-safe slug
 *     (slugifyHeaders),原始 label 保留在 sampleValues[0] 让前端显示
 *   - execute(intent) 由 QueryGateway 转 SQL 后调 executeRaw
 *   - executeRaw(sql) 走 sql-guard → execute
 *   - dispose() 关 db 连接
 *
 * 依赖:`duckdb-async` 包(sync duckdb API 的 promise 包装,核心 duckdb binary
 * 通过它传递;pnpm-only）。
 *
 * 架构师避坑:
 *   #1 CSV 编码:本服务不在 Node 层做 iconv-lite 转码,而是依赖 DuckDB
 *      read_csv_auto 的嗅探能力(支持 UTF-8 / GBK / Latin-1)。若失败,
 *      报错回传前端提示用户重新导出为 UTF-8。
 *   #2 大文件:不 readFileSync,直接传路径给 DuckDB(其内部流式)。
 *   #3 列名特殊字符:slugifyHeaders 保证 SQL 标识符安全 + 原始 label 保留。
 *   #4 [Sprint 4] 类型冲突:用户把全文字列改成 DECIMAL → 用 TRY_CAST 让失败
 *      值变 NULL,不强抛。
 */
@Injectable()
export class DuckDbExecutor implements DataSourceExecutor {
  private readonly logger = new Logger(DuckDbExecutor.name);
  private db!: AsyncDatabase;
  private conn!: AsyncConnection;
  private initialized = false;
  private readonly absFilePath: string;
  private headerMap: Record<string, string> = {};
  private inverseMap: Record<string, string> = {};
  /** 原始 raw 列名(Sprint 4 registerFromCsv 时存在,默认走 read_csv_auto) */
  private readonly viewName: string;
  private readonly initPromise: Promise<void>;
  /** Sprint 4 列覆写(用户在前端改的列名 / 类型);为空则保持自动模式 */
  private readonly columnOverrides: ColumnOverride[];

  constructor(
    readonly dataSourceId: string,
    readonly config: ConnectionConfig & { type: "duckdb-csv" },
  ) {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    this.absFilePath = path.isAbsolute(config.filePath)
      ? config.filePath
      : path.resolve(uploadsDir, config.filePath);

    if (!fs.existsSync(this.absFilePath)) {
      throw new Error(
        `DuckDbExecutor[${dataSourceId}]: CSV file not found: ${this.absFilePath}`,
      );
    }

    this.viewName =
      slugifyHeaders([config.tableAlias]).map[config.tableAlias] ?? "data";

    // [Sprint 4] 从 config.columnOverrides 读取用户覆写
    this.columnOverrides = Array.isArray(
      (config as { columnOverrides?: unknown }).columnOverrides,
    )
      ? ((config as unknown as { columnOverrides: ColumnOverride[] }).columnOverrides)
      : [];

    this.logger.log(
      `DuckDbExecutor[${dataSourceId}] queued async init for ${this.absFilePath} → view "${this.viewName}" (overrides=${this.columnOverrides.length})`,
    );

    // 异步初始化在构造函数里启动,所有方法先 await initPromise 再用
    this.initPromise = this.initializeAsync();
  }

  /**
   * 异步初始化:开连接 + 注册 CSV VIEW + 嗅探 header slug。
   * introspect() / executeRaw() 都先 await this.initPromise。
   *
   * [Sprint 4] 当 columnOverrides 非空,改用
   *   CREATE VIEW ... AS SELECT
   *     col1 AS user_name_1,
   *     TRY_CAST(col2 AS DECIMAL(18,2)) AS user_name_2,
   *     ...
   *   FROM read_csv_auto(...)
   * 这样列名按用户覆写,且 TRY_CAST 让类型冲突的脏数据 → NULL(架构师避坑 #4)。
   */
  private async initializeAsync(): Promise<void> {
    this.db = await AsyncDatabase.create(":memory:");
    this.conn = await AsyncConnection.create(this.db);
    const escapedPath = this.absFilePath.replace(/'/g, "''");

    let createSql: string;
    if (this.columnOverrides.length === 0) {
      createSql = `CREATE VIEW "${this.viewName}" AS SELECT * FROM read_csv_auto('${escapedPath}', header=true, sample_size=-1, ignore_errors=true)`;
    } else {
      // 两层子查询:
      //   内层: read_csv_auto 保留原始 CSV header 名 (如 "Row ID" 含空格)
      //   外层: 引用原始列名 → TRY_CAST → AS slugified_name
      // 避免 slugified name (如 row_id) 被 DuckDB 误当成同 SELECT 的 alias 自引用
      const selectParts: string[] = [];
      for (const ov of this.columnOverrides) {
        // 引用 read_csv_auto 产出的原始列名(含空格/大写, 需双引号包裹)
        const safeOriginal = `"${ov.originalName.replace(/"/g, '""')}"`;
        // 输出列名走 slugify
        const safeNew = slugifyHeaders([ov.newName]).map[ov.newName];
        if (!safeNew) continue;
        if (ov.type && ov.type !== "AUTO") {
          selectParts.push(
            `TRY_CAST(${safeOriginal} AS ${ov.type}) AS "${safeNew}"`,
          );
        } else {
          selectParts.push(`${safeOriginal} AS "${safeNew}"`);
        }
      }
      createSql = `CREATE VIEW "${this.viewName}" AS SELECT ${selectParts.join(", ")} FROM (SELECT * FROM read_csv_auto('${escapedPath}', header=true, sample_size=-1, ignore_errors=true)) AS _raw`;
    }
    await this.conn.exec(createSql);

    const rows = (await this.conn.all(
      `SELECT column_name FROM (DESCRIBE "${this.viewName}")`,
    )) as Array<Record<string, string>>;
    const rawHeaders = rows.map(r => r.column_name);
    const { map, inverseMap } = slugifyHeaders(rawHeaders);
    this.headerMap = map;
    this.inverseMap = inverseMap;
    this.initialized = true;
  }

  async introspect(): Promise<MetadataSnapshot> {
    await this.initPromise;
    const start = Date.now();

    const describeRows = (await this.conn.all(
      `DESCRIBE "${this.viewName}"`,
    )) as Array<Record<string, string>>;

    const table: TableMetadata = {
      name: this.viewName,
      columns: [],
      fkHints: [],
    };

    for (const r of describeRows) {
      const col: ColumnMetadata = {
        name: r.column_name,
        rawType: r.column_type,
        semanticRole: "identifier",
        cardinality: -1,
        sampleValues: [],
        isPrimaryKey: false,
        isForeignKey: false,
      };
      table.columns.push(col);
    }

    const countRows = (await this.conn.all(
      `SELECT COUNT(*) AS cnt FROM "${this.viewName}"`,
    )) as Array<{ cnt: number | bigint }>;
    if (countRows.length) {
      const c = countRows[0].cnt;
      table.rowCount = typeof c === "bigint" ? Number(c) : c;
    }

    await this.enrichSampleValues(table);

    const durationMs = Date.now() - start;
    this.logger.log(
      `DuckDbExecutor[${this.dataSourceId}] introspected ${table.columns.length} columns, ${table.rowCount ?? "?"} rows in ${durationMs}ms`,
    );

    return {
      dataSourceId: this.dataSourceId,
      fetchedAt: new Date().toISOString(),
      tables: [table],
      tokenEstimate: 0,
      truncated: false,
    };
  }

  async execute(_intent: QueryIntent): Promise<QueryResult> {
    throw new Error(
      "DuckDbExecutor.execute(intent) is implemented in QueryGateway layer",
    );
  }

  async executeRaw(rawSql: string): Promise<QueryResult> {
    await this.initPromise;
    const start = Date.now();
    // [Batch 3 B6] gateway 层已做过 guardSql + LIMIT 护栏,executor 不再重复解析 AST
    try {
      const rawRows = (await this.conn.all(rawSql)) as Array<
        Record<string, unknown>
      >;
      const durationMs = Date.now() - start;
      const normalized = rawRows.map(r => normalizeRow(r));
      return {
        rows: normalized,
        rowCount: normalized.length,
        truncated: normalized.length >= 1000,
        durationMs,
      };
    } catch (err) {
      this.logger.error(
        `DuckDbExecutor[${this.dataSourceId}] executeRaw failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      if (!fs.existsSync(this.absFilePath)) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: `CSV file missing: ${this.absFilePath}`,
        };
      }
      await this.initPromise;
      await this.conn.all(`SELECT 1 FROM "${this.viewName}" LIMIT 1`);
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
    // 等待 init 完成(无论成功或失败)
    try { await this.initPromise; } catch { /* init 失败, 继续清理 */ }

    // 先关连接再关数据库, 每个操作独立 try/catch 防止 native crash 传播
    if (this.conn) {
      try { await this.conn.close(); } catch (err) {
        this.logger.debug(
          `DuckDbExecutor[${this.dataSourceId}] conn.close threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (this.db) {
      try { await this.db.close(); } catch (err) {
        this.logger.debug(
          `DuckDbExecutor[${this.dataSourceId}] db.close threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(`DuckDbExecutor[${this.dataSourceId}] disposed`);
  }

  // ============================================================
  // helpers
  // ============================================================

  private async enrichSampleValues(table: TableMetadata): Promise<void> {
    for (const c of table.columns) {
      if (!isSampleableText(c.rawType)) continue;
      try {
        const rows = (await this.conn.all(
          `SELECT DISTINCT "${c.name}" AS v FROM "${this.viewName}" WHERE "${c.name}" IS NOT NULL LIMIT 100`,
        )) as Array<{ v: unknown }>;
        c.sampleValues = rows
          .map(r => {
            const v = r.v;
            if (v === null || v === undefined) return "";
            return String(v);
          })
          .filter(s => s.length > 0 && s.length <= 64)
          .slice(0, 3);
        c.cardinality = rows.length;
      } catch (err) {
        this.logger.debug(
          `DuckDbExecutor[${this.dataSourceId}] sample failed for ${c.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

function isSampleableText(rawType: string): boolean {
  const t = rawType.toUpperCase();
  return /\b(VARCHAR|TEXT|STRING|UUID|ENUM|DATE|TIME|TIMESTAMP|DATETIME)\b/.test(t);
}

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