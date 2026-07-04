import { tool } from "@langchain/core/tools";
import { sql, type RawBuilder } from "kysely";
import { QueryDetailsArgsSchema } from "./schemas";
import { DatabaseService } from "../../database/database.service";

// ============================================================
// 类型策略:
// Kysely 的 SelectQueryBuilder 在动态拼接 join/select 时类型推断很脆弱,
// 此工具的核心逻辑是"按 groupBy 维度拼 SQL",链式调用频繁,
// 所以在 builder 边界用 any 透传,仅保留 RawBuilder 类型给最终 select 列。
// 实际 SQL 由 Postgres 在运行时验证,这是 Kysely 项目里处理动态查询的标准做法。
// ============================================================
type QB = any;
type DimensionBuilder = {
  joins: (qb: QB) => QB;
  key: RawBuilder<string>;
  label: string;
};

const DIMENSION_BUILDERS: Record<string, DimensionBuilder> = {
  product: {
    joins: (qb) =>
      qb.innerJoin("Product as p", "p.id", "s.productId"),
    key: sql<string>`p."name"`,
    label: "产品",
  },
  customer: {
    joins: (qb) =>
      qb
        .innerJoin("SalesOrder as o", "o.id", "s.orderId")
        .innerJoin("Customer as c", "c.id", "o.customerId"),
    key: sql<string>`c."name"`,
    label: "客户",
  },
  state: {
    joins: (qb) =>
      qb
        .innerJoin("SalesOrder as o", "o.id", "s.orderId")
        .innerJoin("Customer as c", "c.id", "o.customerId"),
    key: sql<string>`c."state"`,
    label: "州/省",
  },
  city: {
    joins: (qb) =>
      qb
        .innerJoin("SalesOrder as o", "o.id", "s.orderId")
        .innerJoin("Customer as c", "c.id", "o.customerId"),
    key: sql<string>`c."city"`,
    label: "城市",
  },
  subCategory: {
    joins: (qb) =>
      qb.innerJoin("Product as p", "p.id", "s.productId"),
    key: sql<string>`p."subCategory"`,
    label: "子类别",
  },
  segment: {
    joins: (qb) =>
      qb
        .innerJoin("SalesOrder as o", "o.id", "s.orderId")
        .innerJoin("Customer as c", "c.id", "o.customerId"),
    key: sql<string>`c."segment"`,
    label: "客户类型",
  },
  shipMode: {
    joins: (qb) =>
      qb.innerJoin("SalesOrder as o", "o.id", "s.orderId"),
    key: sql<string>`o."shipMode"`,
    label: "运输方式",
  },
  day: {
    joins: (qb) =>
      qb.innerJoin("SalesOrder as o", "o.id", "s.orderId"),
    key: sql<string>`to_char(o."orderDate", 'YYYY-MM-DD')`,
    label: "日期",
  },
  week: {
    joins: (qb) =>
      qb.innerJoin("SalesOrder as o", "o.id", "s.orderId"),
    key: sql<string>`to_char(o."orderDate", 'YYYY-WW')`,
    label: "周",
  },
  quarter: {
    joins: (qb) =>
      qb.innerJoin("SalesOrder as o", "o.id", "s.orderId"),
    key: sql<string>`'Q' || to_char(o."orderDate", 'Q YYYY')`,
    label: "季度",
  },
  none: {
    // 明细行模式:不 group,直接 select 单条订单行
    joins: (qb) =>
      qb
        .innerJoin("SalesOrder as o", "o.id", "s.orderId")
        .innerJoin("Product as p", "p.id", "s.productId")
        .innerJoin("Customer as c", "c.id", "o.customerId"),
    key: sql<string>`s."id"`,
    label: "明细",
  },
};

// ============================================================
// 指标 → SQL 聚合表达式
// ============================================================
type MetricKey = "sales" | "quantity" | "profit" | "discount" | "orderCount";

const METRIC_SELECTORS: Record<MetricKey, RawBuilder<number>> = {
  sales: sql<number>`SUM(s."sales")`,
  quantity: sql<number>`SUM(s."quantity")`,
  profit: sql<number>`SUM(s."profit")`,
  discount: sql<number>`AVG(s."discount")`,
  orderCount: sql<number>`COUNT(DISTINCT o."id")`,
};

const METRIC_LABELS: Record<MetricKey, string> = {
  sales: "销售额",
  quantity: "销量",
  profit: "利润",
  discount: "平均折扣率",
  orderCount: "订单数",
};

// ============================================================
// 过滤器:按需追加别名 join + WHERE
// 别名 _o_r / _c_r 等避免与维度主 join 冲突
// ============================================================
function applyFilters(
  qb: QB,
  filters: Record<string, string | null | undefined> | null | undefined,
): QB {
  if (!filters) return qb;
  let q: QB = qb;

  if (filters.region) {
    q = q
      .innerJoin("SalesOrder as _o_r", "_o_r.id", "s.orderId")
      .innerJoin("Customer as _c_r", "_c_r.id", "_o_r.customerId");
    q = q.where("_c_r.region", "=", filters.region);
  }
  if (filters.category) {
    q = q.innerJoin("Product as _p_c", "_p_c.id", "s.productId");
    q = q.where("_p_c.category", "=", filters.category);
  }
  if (filters.subCategory) {
    q = q.innerJoin("Product as _p_s", "_p_s.id", "s.productId");
    q = q.where("_p_s.subCategory", "=", filters.subCategory);
  }
  if (filters.state) {
    q = q
      .innerJoin("SalesOrder as _o_st", "_o_st.id", "s.orderId")
      .innerJoin("Customer as _c_st", "_c_st.id", "_o_st.customerId");
    q = q.where("_c_st.state", "=", filters.state);
  }
  if (filters.segment) {
    q = q
      .innerJoin("SalesOrder as _o_g", "_o_g.id", "s.orderId")
      .innerJoin("Customer as _c_g", "_c_g.id", "_o_g.customerId");
    q = q.where("_c_g.segment", "=", filters.segment);
  }
  if (filters.shipMode) {
    q = q.innerJoin("SalesOrder as _o_m", "_o_m.id", "s.orderId");
    q = q.where("_o_m.shipMode", "=", filters.shipMode);
  }
  if (filters.dateFrom) {
    q = q.innerJoin("SalesOrder as _o_f", "_o_f.id", "s.orderId");
    q = q.where(sql<boolean>`DATE(_o_f."orderDate") >= ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    q = q.innerJoin("SalesOrder as _o_t", "_o_t.id", "s.orderId");
    q = q.where(sql<boolean>`DATE(_o_t."orderDate") <= ${filters.dateTo}`);
  }
  return q;
}

// ============================================================
// 工具工厂
// ============================================================
export function createQueryDetailsTool(db: DatabaseService) {
  return tool(
    async (input: import("zod").infer<typeof QueryDetailsArgsSchema>) => {
      try {
        const groupBy = (input.groupBy ?? "product") as string;
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