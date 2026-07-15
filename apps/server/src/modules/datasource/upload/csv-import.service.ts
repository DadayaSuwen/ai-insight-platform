import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import csv from "csv-parser";
import { DatabaseService } from "../../database/database.service";
import { sql, Kysely } from "kysely";
import type { Database } from "../../../core/kysely/types";

/**
 * [Sprint 5.6] CSV 列定义 — inferSchema 的返回值
 */
export interface ColumnDef {
  name: string;       // slugified SQL-safe 列名
  originalName: string; // CSV 原始 header
  type: "VARCHAR" | "DECIMAL" | "DATE" | "BOOLEAN";
}

/**
 * [Sprint 5.6] CsvImportService — 零外部依赖的 CSV→PostgreSQL 引擎
 *
 * 职责:
 *   1. inferSchema  — 流式读 CSV 前 N 行, 推断列类型
 *   2. createTable   — 在 PG 主库动态建表 csv_dataset_<uuid>
 *   3. importCsv     — 流式解析 + 批量 INSERT 导入 PG
 *   4. dropTable     — 删除数据源时联动 DROP TABLE
 *
 * 安全:
 *   - 表名仅由服务端 randomUUID() 生成, 用户输入不进表名
 *   - 列名通过 slugifyIdentifier() 处理 (中文→ASCII, 防注入)
 *   - DDL/DML 操作直接使用 DatabaseService.db, 不走 sql-guard
 *   - 行数硬上限 1,000,000
 */
@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);
  private readonly MAX_ROWS = 1_000_000;
  private readonly BATCH_SIZE = 1_000;
  private readonly SCHEMA_SAMPLE = 100;
  private readonly PREVIEW_ROWS = 5;

  constructor(private readonly db: DatabaseService) {}

  /* ───────── 表名生成 ───────── */

  generateTableName(): string {
    return `csv_dataset_${randomUUID()}`;
  }

  /* ───────── Schema 推断 ───────── */

  /**
   * 流式读取 CSV 前 `sampleSize` 行 (默认 100),
   * 推断每列类型: numeric→DECIMAL, date-like→DATE, bool→BOOLEAN, else→VARCHAR
   */
  async inferSchema(
    filePath: string,
    sampleSize = this.SCHEMA_SAMPLE,
  ): Promise<{ columns: ColumnDef[]; previewRows: Record<string, string>[] }> {
    const typeCounts = new Map<string, Map<string, number>>();
    const headerRow: string[] = [];
    const previewRows: Record<string, string>[] = [];
    let rowCount = 0;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, "utf8").pipe(
        csv({
          strict: false,
          skipLines: 0,
        }),
      );

      stream.on("headers", (headers: string[]) => {
        for (const h of headers) {
          headerRow.push(h);
          typeCounts.set(h, new Map());
        }
      });

      stream.on("data", (row: Record<string, string>) => {
        if (rowCount >= sampleSize) return;
        rowCount++;

        if (previewRows.length < this.PREVIEW_ROWS) {
          previewRows.push({ ...row });
        }

        for (const [col, val] of Object.entries(row)) {
          const counts = typeCounts.get(col);
          if (!counts) continue;
          const t = classifyValue(val);
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      });

      stream.on("end", () => {
        if (headerRow.length === 0) {
          return reject(new Error("CSV file is empty or has no header"));
        }

        const columns: ColumnDef[] = headerRow.map((raw) => {
          const counts = typeCounts.get(raw) ?? new Map();
          const dominant = pickDominantType(counts);
          return {
            name: slugifyForPg(raw),
            originalName: raw,
            type: dominant,
          };
        });

        resolve({ columns, previewRows });
      });

      stream.on("error", (err) => {
        reject(
          new Error(
            `CSV parse error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      });
    });
  }

  /* ───────── 动态建表 ───────── */

  /**
   * 在 PG 主库创建表:
   *   CREATE TABLE "csv_dataset_<uuid>" ("col1" TYPE, "col2" TYPE, ...)
   *
   * @param executor 可选的事务 Kysely 实例, 传入时在事务内执行 DDL
   */
  async createTable(
    tableName: string,
    columns: ColumnDef[],
    executor?: Kysely<Database>,
  ): Promise<void> {
    if (!tableName.startsWith("csv_dataset_")) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    if (columns.length === 0) {
      throw new Error("Cannot create table with 0 columns");
    }

    const colDefs = columns
      .map((c) => `"${c.name}" ${pgType(c.type)}`)
      .join(", ");

    const ddl = `CREATE TABLE "${tableName}" (${colDefs})`;
    const db = executor ?? this.db.db;
    this.logger.log(`Creating table: ${ddl}`);

    try {
      await sql`${sql.raw(ddl)}`.execute(db);
    } catch (err) {
      this.logger.error(
        `Failed to create table ${tableName}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  /* ───────── 流式导入 ───────── */

  /**
   * 流式解析 CSV → 批量 INSERT 到 PG 表。
   * 每 BATCH_SIZE 行 flush 一次; 超过 MAX_ROWS 行中断 + 回滚(DROP TABLE)。
   * 导入完成后删除临时文件。
   *
   * 使用 for-await-of 迭代 csv-parser 流, 自动处理背压 (Node.js 18+)。
   *
   * @param executor 可选的事务 Kysely 实例, 传入时在事务内执行 INSERT
   */
  async importCsv(
    tableName: string,
    filePath: string,
    columns: ColumnDef[],
    executor?: Kysely<Database>,
  ): Promise<{ rowCount: number }> {
    if (!tableName.startsWith("csv_dataset_")) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    // colNames: PG 列名 (slugified), csvHeaders: CSV 原始 header (读 row 用)
    const pgColNames = columns.map((c) => c.name);
    const csvHeaders = columns.map((c) => c.originalName);
    const db = executor ?? this.db.db;
    let batch: Record<string, string>[] = [];
    let totalRows = 0;

    const doFlush = async (rows: Record<string, string>[]): Promise<void> => {
      if (rows.length === 0) return;
      const valueTuples: string[] = [];

      for (const row of rows) {
        const vals: string[] = [];
        for (let i = 0; i < csvHeaders.length; i++) {
          const v = row[csvHeaders[i]]; // 用原始 CSV header 名读值
          if (v === null || v === undefined || v === "") {
            vals.push("NULL");
          } else {
            // 防注入: 转义单引号
            vals.push(`'${String(v).replace(/'/g, "''")}'`);
          }
        }
        valueTuples.push(`(${vals.join(", ")})`);
      }

      const insertSql = `INSERT INTO "${tableName}" (${pgColNames.map((c) => `"${c}"`).join(", ")}) VALUES ${valueTuples.join(", ")}`;

      try {
        await sql`${sql.raw(insertSql)}`.execute(db);
      } catch (err) {
        throw new Error(
          `Batch insert failed at row ~${totalRows}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    const stream = fs.createReadStream(filePath, "utf8").pipe(
      csv({
        strict: false,
        skipLines: 0,
      }),
    );

    try {
      for await (const row of stream) {
        if (totalRows >= this.MAX_ROWS) break;

        totalRows++;
        batch.push(row as Record<string, string>);

        if (batch.length >= this.BATCH_SIZE) {
          await doFlush(batch);
          batch = [];
        }
      }

      // flush 剩余行
      await doFlush(batch);

      if (totalRows >= this.MAX_ROWS) {
        // 超限: 回滚
        if (!executor) {
          // 非事务模式: 直接 DROP
          await this.dropTable(tableName);
        }
        throw new Error(
          `CSV 数据量过大 (≥${this.MAX_ROWS} 行), 请精简后上传或直接接入业务数据库`,
        );
      }

      // 删除临时文件
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      this.logger.log(
        `Imported ${totalRows} rows into "${tableName}"`,
      );
      return { rowCount: totalRows };
    } catch (err) {
      // 事务模式下不单独 dropTable — 让事务回滚处理
      if (!executor) {
        try { await this.dropTable(tableName); } catch { /* ignore */ }
      }
      throw err;
    }
  }

  /* ───────── 清理 ───────── */

  /**
   * 在 Kysely 事务内执行回调。
   * 用于保证 CREATE TABLE + INSERT 的原子性。
   */
  async withTransaction<T>(
    fn: (trx: Kysely<Database>) => Promise<T>,
  ): Promise<T> {
    return this.db.db.transaction().execute(async (trx) => {
      return fn(trx);
    });
  }

  /**
   * 删除数据源时联动 DROP TABLE
   */
  async dropTable(tableName: string): Promise<void> {
    if (!tableName.startsWith("csv_dataset_")) {
      this.logger.warn(`Refusing to drop non-CSV table: ${tableName}`);
      return;
    }
    const ddl = `DROP TABLE IF EXISTS "${tableName}"`;
    this.logger.log(`Dropping table: ${tableName}`);
    try {
      await sql`${sql.raw(ddl)}`.execute(this.db.db);
    } catch (err) {
      this.logger.warn(
        `Failed to drop table ${tableName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/* ───────── 内部 helpers ───────── */

/** 将 CSV 原始 header 转成 PG-safe 标识符 (最大 63 字符) */
function slugifyForPg(raw: string): string {
  let s = raw.trim().normalize("NFKC");
  if (!s) return "_col";

  // 分隔符 → _
  s = s.replace(/[\s.\-/\\,;:\t]+/g, "_");
  // 去掉特殊字符
  s = s.replace(/[ -"'`()\[\]{}<>?!@#$%^&*+=|~]/g, "");

  const hasAscii = /[A-Za-z0-9]/.test(s);
  if (!hasAscii) {
    // 纯中文/表情符号 → hash
    let hex = "";
    for (const ch of s) {
      hex += ch.codePointAt(0)!.toString(16).padStart(4, "0");
    }
    s = `c${hex}`.slice(0, 63);
  } else {
    s = s.replace(/[^A-Za-z0-9_]/g, "_");
    s = s.replace(/_+/g, "_");
    s = s.replace(/^_+|_+$/g, "");
    s = s.toLowerCase();
    if (/^[0-9]/.test(s)) s = `_${s}`;
    if (s.length > 63) s = s.slice(0, 63);
  }
  return s || "_col";
}

/** 根据 cell 值分类 */
function classifyValue(val: string): string {
  if (!val || val.trim() === "") return "NULL";
  // boolean
  if (/^(true|false|yes|no|0|1)$/i.test(val.trim())) return "BOOLEAN";
  // integer
  if (/^-?\d+$/.test(val.trim())) return "DECIMAL";
  // decimal
  if (/^-?\d+\.\d+$/.test(val.trim())) return "DECIMAL";
  // date-like
  if (
    /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(val.trim()) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val.trim())
  ) {
    return "DATE";
  }
  return "VARCHAR";
}

/** 从类型计数中选出 dominant 类型 */
function pickDominantType(
  counts: Map<string, number>,
): "VARCHAR" | "DECIMAL" | "DATE" | "BOOLEAN" {
  let best = "VARCHAR";
  let bestCount = counts.get("VARCHAR") ?? 0;
  for (const t of ["DECIMAL", "DATE", "BOOLEAN"]) {
    const c = counts.get(t) ?? 0;
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  // 至少 70% 的非空值是该类型才用非 VARCHAR
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const nullCount = counts.get("NULL") ?? 0;
  const nonNull = total - nullCount;
  if (nonNull > 0 && bestCount / nonNull < 0.7) {
    return "VARCHAR";
  }
  return best as "VARCHAR" | "DECIMAL" | "DATE" | "BOOLEAN";
}

/** PG 类型映射 */
function pgType(t: ColumnDef["type"]): string {
  switch (t) {
    case "DECIMAL":
      return "DECIMAL(18,3)";
    case "DATE":
      return "DATE";
    case "BOOLEAN":
      return "BOOLEAN";
    default:
      return "VARCHAR";
  }
}
