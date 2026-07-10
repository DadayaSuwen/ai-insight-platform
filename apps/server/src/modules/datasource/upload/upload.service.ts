import { Injectable, Logger } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { MetadataCacheService } from "../metadata/metadata-cache.service";
import { MetadataService } from "../metadata/metadata.service";
import { DatasourceService } from "../datasource.service";
import { CsvImportService, ColumnDef } from "./csv-import.service";

/**
 * [Sprint 5.6] CSV 上传服务 — 流式 PG 入库版
 *
 * Step 1: uploadPreview(file) → multer 临时落盘 → CsvImportService.inferSchema()
 *         返回 { uploadId, columns, previewRows, rowCount }
 *
 * Step 2: registerFromPreview(uploadId, name, columnOverrides)
 *         → CsvImportService.createTable() → importCsv() → 注册 DataSource
 *         → 删除临时文件
 *
 * 与旧版(DuckDB)的关键区别:
 *   - 不再持久化文件到 uploads/
 *   - DataSource type 从 "duckdb-csv" 改为 "postgres"
 *   - 数据存入 PG 主库的 csv_dataset_<uuid> 表
 */

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly ds: DatasourceService,
    private readonly cache: MetadataCacheService,
    private readonly csvImport: CsvImportService,
    private readonly metadataService: MetadataService,
  ) {}

  /** 上传文件临时目录 (register 成功后即删) */
  private uploadsDir(): string {
    return path.resolve(process.cwd(), "uploads");
  }

  /**
   * Step 1 — 上传文件 + 流式推断 schema 返回预览
   */
  async uploadPreview(opts: {
    filePath: string;
    uploadId: string;
    originalName: string;
  }): Promise<UploadPreviewResult> {
    if (!fs.existsSync(opts.filePath)) {
      throw new Error(`Upload file missing: ${opts.filePath}`);
    }

    const { columns, previewRows } = await this.csvImport.inferSchema(
      opts.filePath,
    );

    // 再快速扫一遍总行数 (独立 pass, 轻量)
    const rowCount = await this.countRows(opts.filePath);

    this.logger.log(
      `Upload preview [${opts.uploadId}]: ${columns.length} columns, ${rowCount} rows`,
    );

    return {
      uploadId: opts.uploadId,
      originalName: opts.originalName,
      columns: columns.map((c) => ({
        originalName: c.originalName,
        defaultName: c.name,
        defaultType: c.type,
        sampleValues: previewRows
          .slice(0, 3)
          .map((r) => r[c.originalName] ?? "")
          .filter((s) => s.length > 0 && s.length <= 64)
          .slice(0, 3),
      })),
      previewRows,
      rowCount,
    };
  }

  /**
   * Step 2 — 建表 + 导入 + 注册 DataSource
   */
  async registerFromPreview(opts: {
    userId: string;
    uploadId: string;
    datasetName: string;
    columnOverrides: Array<{
      originalName: string;
      newName: string;
      type: "AUTO" | "VARCHAR" | "DECIMAL" | "DATE" | "BOOLEAN";
      alias?: string; // [Sprint 5.7+] 用户确认的中文别名
    }>;
  }): Promise<{ id: string; name: string; columnCount: number; rowCount: number }> {
    const id = `csv-${opts.uploadId.replace(/^upload-/, "").replace(/\.csv$/i, "")}`;
    const uploadPath = path.join(this.uploadsDir(), opts.uploadId);

    if (!fs.existsSync(uploadPath)) {
      throw new Error(
        `Upload file not found: ${uploadPath}. Please re-upload the CSV.`,
      );
    }

    const tableName = this.csvImport.generateTableName();

    // 1. 推断 schema (用原始 CSV header)
    const { columns: rawColumns } = await this.csvImport.inferSchema(uploadPath);

    // 2. 应用用户列覆写 (如果有)
    const columns = applyOverrides(rawColumns, opts.columnOverrides);

    // 3. CREATE TABLE + COPY 导入
    try {
      await this.csvImport.createTable(tableName, columns);
      const { rowCount } = await this.csvImport.importCsv(
        tableName,
        uploadPath,
        columns,
      );
      // importCsv 成功后已删除临时文件

      // 4. 注册 DataSource (type: postgres, 指向主库)
      const pgConfig = parseDatabaseUrl();
      // [Sprint 5.7+] 提取用户确认的中文别名, 存入 connectionConfig
      const columnAliases: Record<string, string> = {};
      for (const ov of opts.columnOverrides) {
        if (ov.alias && ov.alias.trim() && ov.alias.trim() !== ov.originalName) {
          columnAliases[ov.originalName] = ov.alias.trim();
        }
      }
      const created = await this.ds.register({
        id,
        userId: opts.userId,
        name: opts.datasetName || opts.uploadId,
        type: "postgres",
        connectionConfig: {
          type: "postgres",
          ...pgConfig,
          tableName,
          ...(Object.keys(columnAliases).length > 0 ? { columnAliases } : {}),
        },
      });

      // [Sprint 5.7] 主动触发元数据内省 + LLM 语义推断
      // 避免首次对话时 cold start (用户注册 CSV 后首次提问就能看到中文 schema)
      this.metadataService
        .get(id, { refresh: true })
        .then((snap) => {
          this.logger.log(
            `[Sprint 5.7] Metadata pre-fetched for ${id}: ${snap.tables.length} tables`,
          );
        })
        .catch((err) => {
          this.logger.warn(
            `[Sprint 5.7] Metadata pre-fetch failed for ${id} (non-blocking): ${(err as Error).message}`,
          );
        });

      this.logger.log(
        `CSV registered: ${id} → table "${tableName}" (${rowCount} rows)`,
      );

      return {
        id,
        name: opts.datasetName || created?.name || id,
        columnCount: columns.length,
        rowCount,
      };
    } catch (err) {
      // 回滚: DROP TABLE + 删 DataSource 行 + 删临时文件
      this.logger.error(
        `CSV register failed for ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      try { await this.csvImport.dropTable(tableName); } catch { /* ignore */ }
      try { fs.unlinkSync(uploadPath); } catch { /* ignore */ }
      this.cache.invalidate(id);
      try { await this.ds.deleteForUser(id, opts.userId); } catch { /* ignore */ }
      throw err;
    }
  }

  /**
   * 取消上传: 删除临时文件
   */
  cancelUpload(uploadId: string): void {
    const p = path.join(this.uploadsDir(), uploadId);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  /* ───────── 内部 helpers ───────── */

  /** 快速统计 CSV 行数 (header 不计) */
  private countRows(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = fs.createReadStream(filePath, "utf8");
      // 简单按换行计数, 减去 header
      stream.on("data", (chunk: string) => {
        for (const ch of chunk) {
          if (ch === "\n") count++;
        }
      });
      stream.on("end", () => resolve(Math.max(0, count - 1)));
      stream.on("error", reject);
    });
  }
}

/* ───────── 类型 ───────── */

export interface UploadPreviewResult {
  uploadId: string;
  originalName: string;
  columns: Array<{
    originalName: string;
    defaultName: string;
    defaultType: string;
    sampleValues: string[];
  }>;
  previewRows: Array<Record<string, string>>;
  rowCount: number;
}

/* ───────── helpers ───────── */

/** 应用用户在前端做的列名/类型覆写 */
function applyOverrides(
  raw: ColumnDef[],
  overrides: Array<{
    originalName: string;
    newName: string;
    type: "AUTO" | "VARCHAR" | "DECIMAL" | "DATE" | "BOOLEAN";
  }>,
): ColumnDef[] {
  const overrideMap = new Map(overrides.map((o) => [o.originalName, o]));
  return raw.map((col) => {
    const ov = overrideMap.get(col.originalName);
    if (!ov) return col;
    return {
      ...col,
      name: ov.newName !== col.originalName ? ov.newName : col.name,
      type: ov.type === "AUTO" ? col.type : ov.type,
    };
  });
}

/** 从 DATABASE_URL 解析 PG 连接信息 */
function parseDatabaseUrl(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  // postgresql://user:password@host:port/database
  const match = url.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/,
  );
  if (!match) throw new Error(`Cannot parse DATABASE_URL: ${url}`);

  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
}
