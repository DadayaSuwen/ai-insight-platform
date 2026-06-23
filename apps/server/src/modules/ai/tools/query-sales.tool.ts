import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { QuerySalesArgsSchema } from "./schemas";
import { DatabaseService } from "../../database/database.service";

export function createQuerySalesTool(db: DatabaseService) {
  return tool(
    async (input: z.infer<typeof QuerySalesArgsSchema>) => {
      const { region, category, timeRange, groupBy } = input;

      const where: any = {};
      if (region && region !== "全部") where.region = region;
      if (category && category !== "全部") where.category = category;

      const now = new Date();
      if (timeRange === "今天") {
        where.saleDate = { gte: new Date(now.setHours(0, 0, 0, 0)) };
      } else if (timeRange === "本月") {
        where.saleDate = {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        };
      } else if (timeRange === "上月") {
        where.saleDate = {
          gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          lt: new Date(now.getFullYear(), now.getMonth(), 1),
        };
      } else if (timeRange === "今年") {
        where.saleDate = { gte: new Date(now.getFullYear(), 0, 1) };
      }

      try {
        if (groupBy && groupBy !== "none") {
          const result = await db.prisma.sales.groupBy({
            by: [groupBy],
            where,
            _sum: { amount: true, quantity: true },
            _count: { id: true },
            orderBy: { _sum: { amount: "desc" } },
          });

          return {
            groupByField: groupBy,
            summary: result.map((r: any) => ({
              key: r[groupBy],
              totalAmount: r._sum.amount || 0,
              totalQuantity: r._sum.quantity || 0,
              orderCount: r._count.id,
            })),
          };
        } else {
          const agg = await db.prisma.sales.aggregate({
            where,
            _sum: { amount: true, quantity: true },
            _count: { id: true },
          });

          return {
            totalAmount: agg._sum.amount || 0,
            totalQuantity: agg._sum.quantity || 0,
            orderCount: agg._count.id,
          };
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "query_sales",
      description:
        "查询销售数据。支持按地区、类别、时间筛选，支持按地区或类别汇总销售额。当用户问'卖了多少'、'销售额'、'统计'时使用此工具。",
      schema: QuerySalesArgsSchema,
    },
  );
}

export type QuerySalesTool = ReturnType<typeof createQuerySalesTool>;
