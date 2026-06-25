import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../core/kysely/types";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  public readonly db: Kysely<Database>;

  constructor() {
    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
          // 默认 max=10 太小，多会话并发时会排队甚至超时
          max: 20,
          // 默认永不释放空闲连接，浪费 PG fd
          idleTimeoutMillis: 30_000,
          // 默认 0 = 永不超时，可能挂死；5s 是 node-postgres 文档推荐值
          connectionTimeoutMillis: 5_000,
        }),
      }),
    });
    this.logger.log("Kysely database connection established");
  }

  async onModuleDestroy() {
    await this.db.destroy();
  }

  // 获取数据库 Schema 结构，供未来动态映射使用
  async getSchema() {
    const result = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'`.execute(
      this.db,
    );
    return result.rows;
  }

  // 兼容旧接口的原生 SQL 执行方法
  async executeQuery(querySql: string) {
    try {
      const result = await sql`${sql.raw(querySql)}`.execute(this.db);
      return {
        rows: result.rows,
        rowCount: result.numAffectedRows ?? result.rows.length,
      };
    } catch (error) {
      this.logger.error(
        `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
