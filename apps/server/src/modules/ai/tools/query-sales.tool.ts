import { DatabaseService } from '../../database/database.service';
import { SqlAgent } from '../agents/sql.agent';

/**
 * query_sales tool
 *
 * Executes a SQL query against the sales database and returns rows.
 * Used when the user asks about sales data, orders, amounts, quantities,
 * regional/category/time-based breakdowns.
 */
export function createQuerySalesTool(
  db: DatabaseService,
  sqlAgent: SqlAgent,
) {
  return {
    name: 'query_sales',
    description:
      '执行 SQL 查询销售数据。当用户询问销售额、订单、地区/类别/时间维度的销售数据时调用。返回查询结果。',

    async _call(input: Record<string, unknown>): Promise<string> {
      const query = input.query as string;

      // Step 1: Generate SQL from user query
      const sql = await sqlAgent.generate(query);

      // Step 2: Execute the query
      const rows = await db.executeQuery(sql);

      return JSON.stringify({
        sql,
        rows,
        rowCount: rows.length,
      });
    },
  };
}

export type QuerySalesTool = ReturnType<typeof createQuerySalesTool>;
