import { tool } from "@langchain/core/tools";
import { QueryDetailsArgsSchema } from "./schemas";
import { DatabaseService } from "../../database/database.service";
import {
  DIMENSION_BUILDERS,
  METRIC_SELECTORS,
  METRIC_LABELS,
  applyFilters,
  type QB,
  type MetricKey,
  type DimensionKey,
} from "./dimensions";

// ============================================================
// 工具工厂
// ============================================================
export function createQueryDetailsTool(db: DatabaseService) {
  return tool(
    async (input: import("zod").infer<typeof QueryDetailsArgsSchema>) => {
      try {
        const groupBy = ((input.groupBy ?? "product") as DimensionKey);
        const metrics = (input.metrics ?? ["sales", "quantity", "profit"]) as MetricKey[];
        const topN = Math.min(Math.max(input.topN ?? 10, 1), 100);
        const sortBy = (input.sortBy ?? metrics[0]) as MetricKey;
        const order = input.order ?? "desc";

        // ★ groupBy='none' 强制 topN ≤ 50, 防止 SSE / 前端渲染撑爆
        const safeTopN = groupBy === "none" ? Math.min(topN, 50) : topN;

        const builder = DIMENSION_BUILDERS[groupBy];
        if (!builder) {
          return { error: `Unsupported groupBy: ${groupBy}` };
        }

        // 1. 基础查询
        let qb: QB = db.db.selectFrom("SalesOrderItem as s");

        // 2. 维度 join
        qb = builder.joins(qb);

        // 3. 过滤器(可能再追加 join)
        qb = applyFilters(qb, input.filters ?? null);

        // 4. SELECT key + 指标
        qb = qb.select([
          builder.key.as("key"),
          ...metrics.map((m) => METRIC_SELECTORS[m].as(m)),
        ]);

        // 5. GROUP BY(明细模式无)
        if (groupBy !== "none") {
          qb = qb.groupBy(builder.key);
        }

        // 6. 排序 + 限行 (limit 强制)
        qb = qb.orderBy(METRIC_SELECTORS[sortBy] as any, order).limit(safeTopN);

        const result = await qb.execute();

        const rows = result.map((r: any) => {
          const row: Record<string, number | string> = { key: String(r.key) };
          for (const m of metrics) {
            row[m] =
              m === "discount"
                ? Number(Number(r[m] ?? 0).toFixed(4))
                : Number(r[m] ?? 0);
          }
          return row;
        });

        return {
          groupByField: groupBy,
          label: builder.label,
          metrics,
          metricLabels: metrics.reduce(
            (acc, m) => ({ ...acc, [m]: METRIC_LABELS[m] }),
            {} as Record<string, string>,
          ),
          rows,
          totalRows: rows.length,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "query_details",
      description:
        "查询销售明细数据。**与 query_sales 互补**:query_sales 只做 month/category/region 三种聚合;query_details 支持任意维度(product/customer/state/city/subCategory/segment/shipMode/day/week/quarter)、Top-N、可计算利润/折扣/订单数,适合 'Top 10 客户' '最亏的产品' '各客户类型利润率' 这类问题。需要时**必须**用我而不是 query_sales。",
      schema: QueryDetailsArgsSchema,
    },
  );
}