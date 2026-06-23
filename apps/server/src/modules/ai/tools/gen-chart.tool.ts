import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GenChartArgsSchema } from "./schemas";
import { DatabaseService } from "../../database/database.service";
import { ChartDataItem, ChartHelper } from "./chart.helper";
import { buildSalesWhereClause } from "./sales-query.helper";

export function createGenChartTool(
  db: DatabaseService,
  chartHelper: ChartHelper, // 1. 修正命名
) {
  return tool(
    async (input: z.infer<typeof GenChartArgsSchema>) => {
      const { region, category, timeRange, groupBy, chartType } = input;

      // 2. 使用公共的过滤条件构建器
      const where = buildSalesWhereClause({ region, category, timeRange });

      // 3. 断言 groupField 类型，让 Prisma 满意
      const groupField = (groupBy ?? "category") as "region" | "category";

      try {
        const result = await db.prisma.sales.groupBy({
          by: [groupField],
          where,
          _sum: { amount: true, quantity: true },
          orderBy: { _sum: { amount: "desc" } },
        });

        if (result.length === 0) {
          return { error: "未查询到相关数据，无法生成图表" };
        }

        const chartData = result.map((r) => ({
          name: r[groupField],
          value: r._sum.amount || 0,
        })) as ChartDataItem[];

        // 4. 去掉无意义的 await，直接调用同步方法
        const chart = chartHelper.generate(chartData, chartType, groupField);

        return {
          chartType: chartType,
          chart: chart,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "gen_chart",
      description:
        "生成销售数据可视化图表。支持柱状图、折线图、饼图。当用户要求画图、可视化、看趋势时调用此工具。",
      schema: GenChartArgsSchema,
    },
  );
}

export type GenChartTool = ReturnType<typeof createGenChartTool>;
