import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { sql } from "kysely";
import { QuerySalesArgsSchema } from "./schemas";
import { DatabaseService } from "../../database/database.service";

export function createQuerySalesTool(db: DatabaseService) {
  return tool(
    async (input: z.infer<typeof QuerySalesArgsSchema>) => {
      const { region, category, timeRange, groupBy } = input;

      try {
        // 构建时间过滤条件
        let dateFilter = sql<boolean>`1=1`;
        const now = new Date();
        if (timeRange === "本月") {
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), now.getMonth(), 1)}`;
        } else if (timeRange === "上月") {
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), now.getMonth() - 1, 1)} AND o."orderDate" < ${new Date(now.getFullYear(), now.getMonth(), 1)}`;
        } else if (timeRange === "今年") {
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), 0, 1)}`;
        }

        // 1. 按月份分组 (趋势分析)
        if (groupBy === "month") {
          const result = await db.db
            .selectFrom("SalesOrderItem as s")
            .innerJoin("SalesOrder as o", "o.id", "s.orderId")
            .select([
              sql<string>`to_char(o."orderDate", 'YYYY-MM')`.as("key"),
              sql<number>`SUM(s.sales)`.as("totalAmount"),
              sql<number>`SUM(s.quantity)`.as("totalQuantity"),
            ])
            .where(dateFilter)
            .groupBy(sql`to_char(o."orderDate", 'YYYY-MM')`)
            .orderBy("key", "asc")
            .execute();

          const summary = result.map((r: any) => ({
            key: r.key,
            totalAmount: Number(r.totalAmount),
            totalQuantity: Number(r.totalQuantity),
          }));
          return { groupByField: "month", summary };
        }

        // 2. 按类别分组
        if (groupBy === "category") {
          let query = db.db
            .selectFrom("SalesOrderItem as s")
            .innerJoin("Product as p", "p.id", "s.productId")
            .innerJoin("SalesOrder as o", "o.id", "s.orderId")
            .select([
              "p.category as key",
              sql<number>`SUM(s.sales)`.as("totalAmount"),
              sql<number>`SUM(s.quantity)`.as("totalQuantity"),
            ])
            .where(dateFilter)
            .groupBy("p.category")
            .orderBy("totalAmount", "desc");

          if (category && category !== "全部")
            query = query.where("p.category", "=", category);

          const result = await query.execute();
          const summary = result.map((r: any) => ({
            key: r.key,
            totalAmount: Number(r.totalAmount),
            totalQuantity: Number(r.totalQuantity),
          }));
          return { groupByField: "category", summary };
        }

        // 3. 按地区分组
        if (groupBy === "region") {
          let query = db.db
            .selectFrom("SalesOrderItem as s")
            .innerJoin("SalesOrder as o", "o.id", "s.orderId")
            .innerJoin("Customer as c", "c.id", "o.customerId")
            .select([
              "c.region as key",
              sql<number>`SUM(s.sales)`.as("totalAmount"),
              sql<number>`SUM(s.quantity)`.as("totalQuantity"),
            ])
            .where(dateFilter)
            .groupBy("c.region")
            .orderBy("totalAmount", "desc");

          if (region && region !== "全部")
            query = query.where("c.region", "=", region);

          const result = await query.execute();
          const summary = result.map((r: any) => ({
            key: r.key,
            totalAmount: Number(r.totalAmount),
            totalQuantity: Number(r.totalQuantity),
          }));
          return { groupByField: "region", summary };
        }

        // 4. 默认全量汇总
        const result = await db.db
          .selectFrom("SalesOrderItem as s")
          .innerJoin("SalesOrder as o", "o.id", "s.orderId")
          .select([
            sql<number>`SUM(s.sales)`.as("totalAmount"),
            sql<number>`SUM(s.quantity)`.as("totalQuantity"),
            sql<number>`COUNT(s.id)`.as("orderCount"),
          ])
          .where(dateFilter)
          .executeTakeFirst();

        if (result) {
          return {
            totalAmount: Number(result.totalAmount),
            totalQuantity: Number(result.totalQuantity),
            orderCount: Number(result.orderCount),
          };
        }
        return { totalAmount: 0, totalQuantity: 0, orderCount: 0 };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "query_sales",
      description:
        "查询销售数据。支持按时间(本月/今年)、地区、类别筛选，支持按月(趋势)、地区、类别汇总。当用户问'卖了多少'、'趋势'、'统计'时使用。",
      schema: QuerySalesArgsSchema,
    },
  );
}
