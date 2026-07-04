import { tool } from "@langchain/core/tools";
import { sql } from "kysely";
import { GenChartArgsSchema } from "./schemas";
import { DatabaseService } from "../../database/database.service";
import { ChartHelper } from "./chart.helper";
import { ChartAgent } from "../agents/chart.agent";

/**
 * gen_chart 工具工厂
 *
 * 数据流:
 *   1. SQL 聚合拿到 rawResult (同原逻辑)
 *   2. 优先用 ChartAgent (LLM-driven ECharts config 生成)
 *   3. LLM 失败时降级到 ChartHelper (静态模板,稳定)
 *
 * 原 Planner 持有的 chartAgent: ChartHelper 字段已重命名为 chartHelper,
 * 真正的 ChartAgent 实例作为第二个依赖传入。
 */
export function createGenChartTool(
  db: DatabaseService,
  chartHelper: ChartHelper,
  chartAgent: ChartAgent,
) {
  return tool(
    async (
      input: import("zod").infer<typeof GenChartArgsSchema> & {
        // 由 Planner 注入的运行时上下文 (不来自 LLM args)
        originalMessage?: string;
      },
    ) => {
      const { region, category, timeRange, groupBy, chartType } = input;
      const groupField = (groupBy ?? "category") as
        | "region"
        | "category"
        | "month";

      try {
        let dateFilter = sql<boolean>`1=1`;
        const now = new Date();
        if (timeRange === "本月")
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), now.getMonth(), 1)}`;
        else if (timeRange === "今年")
          dateFilter = sql`o."orderDate" >= ${new Date(now.getFullYear(), 0, 1)}`;

        let rawResult: { name: string; value: number }[] = [];

        if (groupField === "month") {
          const result = await db.db
            .selectFrom("SalesOrderItem as s")
            .innerJoin("SalesOrder as o", "o.id", "s.orderId")
            .select([
              sql<string>`to_char(o."orderDate", 'YYYY-MM')`.as("name"),
              sql<number>`SUM(s."sales")`.as("value"),
            ])
            .where(dateFilter)
            .groupBy(sql`to_char(o."orderDate", 'YYYY-MM')`)
            .orderBy("name", "asc")
            .execute();

          rawResult = result.map((r: any) => ({
            name: r.name,
            value: Number(r.value),
          }));
        } else if (groupField === "category") {
          let query = db.db
            .selectFrom("SalesOrderItem as s")
            .innerJoin("Product as p", "p.id", "s.productId")
            .innerJoin("SalesOrder as o", "o.id", "s.orderId")
            .select([
              "p.category as name",
              sql<number>`SUM(s."sales")`.as("value"),
            ])
            .where(dateFilter)
            .groupBy("p.category")
            .orderBy("value", "desc");

          if (category && category !== "全部")
            query = query.where("p.category", "=", category);

          const result = await query.execute();
          rawResult = result.map((r: any) => ({
            name: r.name,
            value: Number(r.value),
          }));
        } else {
          let query = db.db
            .selectFrom("SalesOrderItem as s")
            .innerJoin("SalesOrder as o", "o.id", "s.orderId")
            .innerJoin("Customer as c", "c.id", "o.customerId")
            .select(["c.region as name", sql<number>`SUM(s."sales")`.as("value")])
            .where(dateFilter)
            .groupBy("c.region")
            .orderBy("value", "desc");

          if (region && region !== "全部")
            query = query.where("c.region", "=", region);

          const result = await query.execute();
          rawResult = result.map((r: any) => ({
            name: r.name,
            value: Number(r.value),
          }));
        }

        if (rawResult.length === 0)
          return { error: "未查询到相关数据，无法生成图表" };

        // ★ Phase 3: 优先用 ChartAgent (LLM-driven),失败时降级到 ChartHelper
        const contextMessage =
          input.originalMessage ?? `${groupField} ${chartType} chart`;
        let chart: Record<string, unknown>;
        let chartSource: "agent" | "fallback" = "agent";

        try {
          chart = (await chartAgent.generate(rawResult, contextMessage)) as Record<string, unknown>;
        } catch (err) {
          // Fallback 路径,保证图表一定能渲染
          chart = chartHelper.generate(rawResult, chartType, groupField);
          chartSource = "fallback";
        }

        return { chartType, chart, chartSource };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "gen_chart",
      description:
        "生成销售数据可视化图表。支持柱状图、折线图、饼图。看趋势时必须用line图且groupBy填month。图表标题、配色、轴标注会自动适配用户问题上下文。",
      schema: GenChartArgsSchema,
    },
  );
}