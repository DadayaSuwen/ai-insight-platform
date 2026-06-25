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
  // 返回 column_name / data_type / is_nullable。
  // 只查 public schema；调用方负责过滤业务表。
  async getSchema() {
    const result = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`.execute(this.db);
    return result.rows;
  }

  // 获取每张表的主键列名（information_schema.table_constraints + key_column_usage）。
  // 用于在 LLM 提示里标注 "PK" 标记。
  async getPrimaryKeys(): Promise<Map<string, string[]>> {
    const result = await sql<{
      table_name: string;
      column_name: string;
    }>`SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = 'public'`.execute(this.db);
    const pkMap = new Map<string, string[]>();
    for (const row of result.rows) {
      const cols = pkMap.get(row.table_name) ?? [];
      cols.push(row.column_name);
      pkMap.set(row.table_name, cols);
    }
    return pkMap;
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
