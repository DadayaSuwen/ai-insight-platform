import { Injectable, Logger, ForbiddenException } from "@nestjs/common";
import type {
  ConnectionConfig,
  MetadataSnapshot,
  QueryIntent,
} from "@workspace/types";
import type { QueryResult } from "../executors/executor.interface";
import { ExecutorFactory } from "../executors/executor.factory";
import { guardSql } from "../security/sql-guard";
import { getDialect, type QueryIntentArgs } from "./dialect";
import { validateIntent } from "./intent-validator";
import { QueryCacheService } from "./cache.service";
import { DatasourceService } from "../datasource.service";

/**
 * [Sprint 1+4+5 / V3] 查询网关 — 跨数据源统一入口 + 多租户
 *
 * Sprint 2 实装 executeIntent(intent, snapshot):
 *   1. cache.get(dataSourceId, intent) → 有则直接返回 [Sprint 4]
 *   2. validateIntent(intent, snapshot)  ← 架构师避坑 #1
 *   3. getDialect(type).translate(intent, snapshot)
 *   4. guardSql(sql)  ← 安全护栏
 *   5. executor.executeRaw(safe SQL)
 *   6. cache.set(dataSourceId, intent, result)  ← [Sprint 4]
 *
 * executeSQL(dataSourceId, config, rawSql) 仍保留(Sprint 1 路径)
 * 作为元数据采样 / 调试用,**不走 cache**(因为 raw SQL 没有稳定 key)。
 *
 * [Sprint 4] connectionConfig 在 executor 创建前调用
 * DatasourceService.decryptConfigForExecutor 解密 password。
 *
 * [Sprint 5] 多租户:executeIntent / executeSQL 都接受 currentUserId,
 * 在执行前校验 DataSource.userId === currentUserId,不匹配 → 403。
 * (架构师铁律:跨用户查询视为越权)
 */
@Injectable()
export class QueryGatewayService {
  private readonly logger = new Logger(QueryGatewayService.name);

  constructor(
    private readonly factory: ExecutorFactory,
    private readonly cache: QueryCacheService,
    private readonly ds: DatasourceService,
  ) {}

  /**
   * 直 SQL 路径(Sprint 1 已有)。不走 cache。
   *
   * [Sprint 5] currentUserId 必填,所有权校验 → 403
   * [Sprint 5] 不在 finally 中 dispose,executor 复用(Sprint 5 connection pool)
   * 失败时显式 evict,避免坏 executor 留在 pool 中
   */
  async executeSQL(
    dataSourceId: string,
    currentUserId: string,
    sql: string,
  ): Promise<QueryResult> {
    const record = await this.ds.getByIdForUser(dataSourceId, currentUserId);
    if (!record) {
      throw new ForbiddenException(
        `DataSource ${dataSourceId} not accessible to current user`,
      );
    }
    const config = this.ds.decryptConfigForExecutor(
      record.connectionConfig as unknown as ConnectionConfig,
    );
    const executor = this.factory.create(dataSourceId, config);
    try {
      return await executor.executeRaw(sql);
    } catch (err) {
      // executor 失败时 evict,下次 create() 会重建(Sprint 5 连接池清理)
      await this.factory.evict(dataSourceId);
      throw err;
    }
  }

  /**
   * [Sprint 2+4+5] 主路径 — QueryIntent → SQL → rows(带缓存 + 所有权校验)
   */
  async executeIntent(
    dataSourceId: string,
    currentUserId: string, // [Sprint 5]
    intent: QueryIntent,
    snapshot: MetadataSnapshot,
  ): Promise<QueryResult> {
    // 0. [Sprint 5] 所有权校验先于缓存查询,确保租户隔离
    const record = await this.ds.getByIdForUser(dataSourceId, currentUserId);
    if (!record) {
      throw new ForbiddenException(
        `DataSource ${dataSourceId} not accessible to current user`,
      );
    }

    // [Sprint 5.7] 保存原始 intent 用于缓存 key (中文名 key,防止 remap 后 key 不一致)
    // QueryIntent 是纯 Zod-validated 对象,JSON round-trip 足够深拷贝
    const originalIntent: QueryIntent = JSON.parse(JSON.stringify(intent));

    // 0.5 [Sprint 4] 查缓存 (key 含 userId + dataSourceId + 原始 intent hash)
    const cached = this.cache.get(dataSourceId, currentUserId, originalIntent);
    if (cached) {
      return cached;
    }

    const config = this.ds.decryptConfigForExecutor(
      record.connectionConfig as unknown as ConnectionConfig,
    );

    // [Sprint 5.7] 中文→物理反查：如果 LLM 误用了中文名，自动修正
    intent = remapChineseToPhysical(intent, snapshot);

    // 1. 校验 — 架构师避坑 #1: 拦截 LLM 输出不存在 column
    validateIntent(intent, snapshot);

    // 2. 转 args (从完整 QueryIntent 简化到 dialect 需要的)
    const args: QueryIntentArgs = {
      table: intent.table,
      groupBy: intent.groupBy,
      metrics: intent.metrics.map(m => ({
        column: m.column,
        agg: m.agg,
        alias: m.alias,
        label: m.label,
      })),
      filters: intent.filters.map(f => ({
        column: f.column,
        op: f.op,
        value: f.value,
      })),
      orderBy: intent.orderBy,
      limit: Math.min(intent.limit, 1000),
    };

    // 3. 翻译
    const dialect = getDialect(config.type);
    const { sql } = dialect.translate(args, snapshot);

    // 4. 安全护栏 + LIMIT 包裹
    // [本次] 把下游方言告诉 guardSql, 否则 MySqlDialect 产出的反引号包裹
    // 标识符会被 PG 模式解析器误判, 报"SQL 语法错误"。
    const parserDialect: "postgresql" | "mysql" | "duckdb" =
      config.type === "mysql"
        ? "mysql"
        : config.type === "duckdb-csv"
        ? "duckdb"
        : "postgresql";
    const guard = guardSql(sql, { dialect: parserDialect });
    if (guard.rejected) {
      throw new Error(`SQL rejected by guard: ${guard.reason}`);
    }
    this.logger.debug(
      `[QueryGateway] ${dataSourceId}/${config.type} (user=${currentUserId}): ${guard.sql.slice(0, 200)}`,
    );

    // 5. 执行
    const result = await this.executeSQL(dataSourceId, currentUserId, guard.sql);

    // 6. [Sprint 4] 写缓存 (用 originalIntent 做 key,保证中文名查询可命中)
    this.cache.set(dataSourceId, currentUserId, originalIntent, result);
    // [本次] 透出实际执行的 SQL,供工具结果 / 前端展示用
    return { ...result, sql: guard.sql };
  }
}

/**
 * [Sprint 5.7 / Fix] 中文→物理名反查 + 自动修正（表名 + 列名）
 *
 * 如果 LLM 误把 chineseName 写进了 QueryIntent 的 table/groupBy/metrics/filters/orderBy，
 * 这里静默转换为物理名，避免抛 IntentValidationError 让 LLM 陷入重试死循环。
 *
 * [Fix] 关键修复:先把 intent.table 解析为物理表名（原实现只按物理名精确匹配，
 * 一旦 LLM 用中文/大小写不一致的表名，find 返回 undefined → 整个 remap 被跳过，
 * 列名也拿不到映射 → 每轮 validateIntent 失败 → 重试死循环）。
 *
 * 仅当能在 snapshot 中定位到对应物理名时才替换，否则保持原值（让 validator 报错）。
 */
function remapChineseToPhysical(
  intent: QueryIntent,
  snapshot: MetadataSnapshot,
): QueryIntent {
  // 1. [Fix] 先解析物理表名:精确 → 大小写不敏感 → 去除空白/分隔符的模糊匹配
  const physicalTable = resolvePhysicalTable(intent.table, snapshot);
  const table = snapshot.tables.find((t) => t.name === physicalTable);
  if (!table) return intent; // 无法定位表,交给 validator 报错

  // 2. 构建 列中文名 → 物理列名 映射
  const cnMap = new Map<string, string>();
  for (const col of table.columns) {
    if (col.chineseName && col.chineseName !== col.name) {
      cnMap.set(col.chineseName, col.name);
    }
  }

  const remap = (val: string) => cnMap.get(val) ?? val;
  const tableChanged = physicalTable !== intent.table;

  // 若表名无需改、且无列中文映射,原样返回
  if (!tableChanged && cnMap.size === 0) return intent;

  // 深拷贝以避免副作用影响缓存 key
  return {
    ...intent,
    table: physicalTable,
    groupBy: intent.groupBy?.map(remap),
    metrics: intent.metrics?.map((m) => ({ ...m, column: remap(m.column) })),
    filters: intent.filters?.map((f) => ({ ...f, column: remap(f.column) })),
    orderBy: intent.orderBy
      ? { ...intent.orderBy, column: remap(intent.orderBy.column) }
      : undefined,
  };
}

/**
 * [Fix] 把 LLM 给的表名解析为 snapshot 中真实存在的物理表名。
 * 表元数据没有 chineseName 字段,所以只能靠标准化匹配:
 *   1) 精确匹配 → 直接用
 *   2) 大小写不敏感匹配
 *   3) 去除空白/下划线/连字符后的规范化匹配
 * 都失败则原样返回(交给 validator 报错)。
 */
function resolvePhysicalTable(
  wanted: string,
  snapshot: MetadataSnapshot,
): string {
  if (snapshot.tables.some((t) => t.name === wanted)) return wanted;

  const lower = wanted.toLowerCase();
  const ci = snapshot.tables.find((t) => t.name.toLowerCase() === lower);
  if (ci) return ci.name;

  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const target = norm(wanted);
  const fuzzy = snapshot.tables.find((t) => norm(t.name) === target);
  return fuzzy ? fuzzy.name : wanted;
}