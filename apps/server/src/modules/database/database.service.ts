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
