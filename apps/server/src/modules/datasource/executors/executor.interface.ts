import type {
  ConnectionConfig,
  MetadataSnapshot,
} from "@workspace/types";
import type { QueryIntent } from "@workspace/types";

/**
 * [Sprint 1 / V3] DataSourceExecutor 接口
 * --------------------------------------------------------------
 * 每个数据源类型(PG / MySQL / DuckDB-CSV)实现一个 DataSourceExecutor
 * —— 拥有独立的连接(Kysely / mysql2 / DuckDB 实例),
 * 调用 dispose() 时 GC 释放。
 *
 * 不允许 fallback 到默认 executor:每种 type 必须显式实现。
 * Sprint 1 stub 类型(MySQL、DuckDB-CSV)在 Sprint 2/3 完整化。
 *
 * 设计动机(架构 V3 原则 4 — 连接隔离):
 *   - 阻断一个 datasource 的问题不会污染其他 datasource
 *   - 删除 datasource = 自动断连
 *   - 安全护栏以 executor 为边界(不允许 raw SQL 跨 executor 跑)
 */

export interface QueryResult {
  rows: Array<Record<string, number | string>>;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface DataSourceExecutor {
  /** 对应 Prisma DataSource.id */
  readonly dataSourceId: string;
  /** 完整连接配置,从 DataSource 行读出 */
  readonly config: ConnectionConfig;

  /** introspect — 读 DB schema + 样例,产出 MetadataSnapshot */
  introspect(): Promise<MetadataSnapshot>;

  /** execute — Sprint 2 才真正使用;Sprint 1 通过 executeSQL 路径 */
  execute(intent: QueryIntent): Promise<QueryResult>;

  /**
   * executeRaw — Sprint 1 已可用,以字符串 SQL 直接执行(已过 sql-guard)。
   * Sprint 2 后,execute(intent) 是主路径,本方法留作"调试 / 元数据采样"。
   */
  executeRaw(sql: string): Promise<QueryResult>;

  /** healthCheck — 网络/连接断检测 */
  healthCheck(): Promise<HealthCheckResult>;

  /** dispose — 关闭 Kysely/Pool/DuckDB 实例 */
  dispose(): Promise<void>;
}
