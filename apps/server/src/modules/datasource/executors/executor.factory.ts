import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import type { ConnectionConfig } from "@workspace/types";
import type { DataSourceExecutor } from "./executor.interface";
import { DuckDbExecutor } from "./duckdb.executor";

/**
 * [Sprint 1+5 / V3] Executor 工厂 — 长连接池 + lazy init
 *
 * 行为变更 (Sprint 5):
 *   - 维护 Map<dataSourceId, DataSourceExecutor>,首次 create() 时 lazy init,
 *     后续直接复用(连接池复用)
 *   - PG / MySQL executor 通过 require() 延迟加载,避免在 jest CJS
 *     测试中触发 kysely ESM-only 的 require 错
 *   - DuckDB executor 是 ESM 友好的 duckdb-async,顶层 import 安全
 *   - evict(id):DataSource 删除 / refresh 时调用,释放连接
 *   - OnModuleDestroy:全部 dispose,优雅关闭
 *
 * 架构师避坑 #2 (Sprint 5):
 *   - 高频并发查询不再每次 create/dispose(短连接风暴)
 *   - DataSource 注册时 lazy 初始化,首次 introspect / executeSQL 时建立连接
 */
@Injectable()
export class ExecutorFactory implements OnModuleDestroy {
  private readonly logger = new Logger(ExecutorFactory.name);
  private readonly pool = new Map<string, DataSourceExecutor>();
  private readonly poolSize = Number(process.env.DB_POOL_SIZE ?? 10);

  create(dataSourceId: string, config: ConnectionConfig): DataSourceExecutor {
    const existing = this.pool.get(dataSourceId);
    if (existing) {
      return existing;
    }
    const exec = this.createNew(dataSourceId, config);
    this.pool.set(dataSourceId, exec);
    this.logger.log(
      `ExecutorFactory created executor[${dataSourceId}] (pool size now: ${this.pool.size})`,
    );
    return exec;
  }

  private createNew(
    dataSourceId: string,
    config: ConnectionConfig,
  ): DataSourceExecutor {
    switch (config.type) {
      case "postgres":
        // [Sprint 5] PG executor 通过 require 延迟加载,
        // 避免顶层 import 触发 kysely ESM 链
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PgExecutor } = require("./pg.executor");
        return new PgExecutor(dataSourceId, config, this.poolSize);
      case "mysql":
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MysqlExecutor } = require("./mysql.executor");
        return new MysqlExecutor(dataSourceId, config, this.poolSize);
      case "duckdb-csv":
        // [Sprint 5.6] DuckDB executor 已退役, 仅向后兼容旧数据源
        this.logger.warn(
          `ExecutorFactory creating deprecated DuckDbExecutor[${dataSourceId}] — new CSV imports should use CsvImportService`,
        );
        return new DuckDbExecutor(dataSourceId, config);
      default: {
        const _exhaustive: never = config;
        throw new Error(
          `Unknown DataSource type: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }

  async evict(dataSourceId: string): Promise<boolean> {
    const exec = this.pool.get(dataSourceId);
    if (!exec) return false;
    this.pool.delete(dataSourceId);
    try {
      await exec.dispose();
    } catch (err) {
      this.logger.warn(
        `ExecutorFactory evict[${dataSourceId}] dispose failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.logger.log(
      `ExecutorFactory evicted executor[${dataSourceId}] (pool size now: ${this.pool.size})`,
    );
    return true;
  }

  size(): number {
    return this.pool.size;
  }

  ids(): string[] {
    return Array.from(this.pool.keys());
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(`ExecutorFactory disposing all ${this.pool.size} executors`);
    const ids = Array.from(this.pool.keys());
    await Promise.all(
      ids.map(id =>
        this.evict(id).catch(err =>
          this.logger.warn(
            `ExecutorFactory evict[${id}] during shutdown failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        ),
      ),
    );
  }
}