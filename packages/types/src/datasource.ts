import { z } from "zod";

// ============================================================
// [Sprint 1] 多数据源架构 V3 — DataSource 类型契约
// ------------------------------------------------------------
// 思路:把 "数据源注册 + 元数据缓存 + 查询网关" 抽离,让 AI Agent 不再硬编码
// 单一业务表。新增数据源 = 注册一行 DataSource,不改 Agent 代码。
//
// 关系:
// - DataSource       ← DataSource row (配置层,Prisma 持久化)
// - ConnectionConfig ← 每个数据源的连接参数(discriminated union by type)
// - TableMetadata / ColumnMetadata ← 单张表/列的元数据(MetadataSnapshot 用)
// - MetadataSnapshot ← 一次 introspect 的全量结果(Prompt 注入用)
// ============================================================

// ============================================================
// 1. 数据源类型 + 连接配置
// ============================================================

export const DataSourceTypeSchema = z.enum(["postgres", "mysql", "duckdb-csv"]);
export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

/**
 * 连接配置 — discriminated union by `type`:
 *
 * - postgres: 透传外部 PG 数据库(Kysely + pg.Pool per-executor)
 * - mysql:    同上,用 mysql2 (Sprint 2 实装,Sprint 1 留 stub)
 * - duckdb-csv: 上传到 apps/server/uploads/ 的 CSV,DuckDB 内存查询
 *
 * 安全要求(架构师铁律 #3):外部 PG/MySQL 强烈建议使用只读 DB 用户 (`ai_insight_ro`),
 * 即使如此,运行时仍走 sql-guard 正则 + LIMIT 1000 强制包裹。
 */
export const ConnectionConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("postgres"),
    host: z.string().min(1),
    port: z.number().int().positive(),
    database: z.string().min(1),
    user: z.string().min(1),
    password: z.string().optional(),
    ssl: z.boolean().default(false),
    schema: z.string().default("public"),
    /** [Sprint 5.6] CSV 导入时指定目标表名, PgExecutor 仅内省该表 */
    tableName: z.string().optional(),
  }),
  z.object({
    type: z.literal("mysql"),
    host: z.string().min(1),
    port: z.number().int().positive(),
    database: z.string().min(1),
    user: z.string().min(1),
    password: z.string().optional(),
  }),
  z.object({
    type: z.literal("duckdb-csv"),
    /** 相对于 apps/server/uploads/ 的路径(Sprint 3 使用) */
    filePath: z.string().min(1),
    /** DuckDB 暴露给 LLM 的逻辑表名(默认 'data') */
    tableAlias: z.string().min(1).default("data"),
    /** [Sprint 4] 列覆写:前端预览页用户修改后的列名 / 类型 */
    columnOverrides: z
      .array(
        z.object({
          originalName: z.string(),
          newName: z.string(),
          type: z.enum(["AUTO", "VARCHAR", "DECIMAL", "DATE", "BOOLEAN"]),
        }),
      )
      .optional(),
  }),
]);
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

// ============================================================
// 2. DataSource 主体 (Prisma 模型对齐)
// ============================================================

export const DataSourceStatusSchema = z.enum(["active", "paused", "error"]);
export type DataSourceStatus = z.infer<typeof DataSourceStatusSchema>;

export const DataSourceSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: DataSourceTypeSchema,
  connectionConfig: ConnectionConfigSchema,
  status: DataSourceStatusSchema.default("active"),
  lastError: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

// ============================================================
// 3. 元数据快照 (Planner System Prompt 注入用)
// ============================================================

/**
 * 列的语义角色 — 由 MetadataService.inferSemantics() 自动推断:
 * - 'dimension': 低基数字符串列(枚举值,适合 groupBy)
 * - 'measure':   数值列(适合 SUM/AVG)
 * - 'time':      ISO date/time 列(适合时序图)
 * - 'identifier': 高基数字符串/UUID 列(不适合聚合,只用于过滤)
 */
export const SemanticRoleSchema = z.enum([
  "dimension",
  "measure",
  "time",
  "identifier",
]);
export type SemanticRole = z.infer<typeof SemanticRoleSchema>;

export const ColumnMetadataSchema = z.object({
  name: z.string(),
  /** 数据库原始类型,如 'integer', 'numeric(10,2)', 'text', 'timestamp' */
  rawType: z.string(),
  semanticRole: SemanticRoleSchema,
  /** [Sprint 5.7] LLM 语义推断 — 中文业务名称,如 "订单金额" */
  chineseName: z.string().optional(),
  /** [Sprint 5.7] LLM 语义推断 — 一句话描述该字段的业务含义 */
  description: z.string().optional(),
  /** 不同值的数量。-1 表示未知(全表扫太慢时不计算) */
  cardinality: z.number().int().nonnegative().default(-1),
  /** 最多 8 个 sample values(用户输入过滤时模糊匹配) */
  sampleValues: z
    .array(z.union([z.string(), z.number()]))
    .max(8)
    .default([]),
  isPrimaryKey: z.boolean().default(false),
  isForeignKey: z.boolean().default(false),
  referencesTable: z.string().optional(),
  referencesColumn: z.string().optional(),
});
export type ColumnMetadata = z.infer<typeof ColumnMetadataSchema>;

export const ForeignKeyHintSchema = z.object({
  columns: z.array(z.string()),
  referencedTable: z.string(),
  referencedColumns: z.array(z.string()),
});
export type ForeignKeyHint = z.infer<typeof ForeignKeyHintSchema>;

export const TableMetadataSchema = z.object({
  name: z.string(),
  columns: z.array(ColumnMetadataSchema),
  rowCount: z.number().int().nonnegative().optional(),
  fkHints: z.array(ForeignKeyHintSchema).optional(),
});
export type TableMetadata = z.infer<typeof TableMetadataSchema>;

export const MetadataSnapshotSchema = z.object({
  dataSourceId: z.string(),
  fetchedAt: z.string().datetime(),
  tables: z.array(TableMetadataSchema),
  /** 序列化进 Prompt 的总字符估算,超过 token budget 会触发截断 */
  tokenEstimate: z.number().int().nonnegative().default(0),
  truncated: z.boolean().default(false),
});
export type MetadataSnapshot = z.infer<typeof MetadataSnapshotSchema>;

// ============================================================
// 4. 类型守护函数
// ============================================================

export function validateDataSource(data: unknown): DataSource {
  return DataSourceSchema.parse(data);
}

export function safeParseDataSource(data: unknown): DataSource | null {
  const result = DataSourceSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function validateMetadataSnapshot(data: unknown): MetadataSnapshot {
  return MetadataSnapshotSchema.parse(data);
}
