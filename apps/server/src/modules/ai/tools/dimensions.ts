import { sql, type RawBuilder } from "kysely";

// ============================================================
// 维度/指标元数据 (ChartAgent 升级 M2 抽出)
// ------------------------------------------------------------
// 原本只在 query-details.tool.ts 内,query_sales/gen_chart 各写一套 SQL。
// 升级后 gen_chart 也要复用同一套 builder (14 个 groupBy 维度),
// 把 SQL 模板集中到本文件,query-details + gen-chart 两个工具共用。
// ============================================================

// 类型策略: Kysely SelectQueryBuilder 在动态拼接 join/select 时类型推断很脆弱,
// 在 builder 边界用 any 透传,仅保留 RawBuilder 类型给最终 select 列。
// 实际 SQL 由 Postgres 在运行时验证,这是 Kysely 项目里处理动态查询的标准做法。
export type QB = any;

export type DimensionKey =
  // query_sales / gen_chart 维度 (固定聚合)
  | "region"
  | "category"
  | "month"
  // query_details 维度 (任意维度)
  | "product"
  | "customer"
  | "state"
  | "city"
  | "subCategory"
  | "segment"
  | "shipMode"
  | "day"
  | "week"
  | "quarter"
  // 不聚合
  | "none";

export type DimensionBuilder = {
  joins: (qb: QB) => QB;
  key: RawBuilder<string>;
  label: string;
};

/**
 * 14 个 groupBy 维度 → Kysely SQL builder
 *
 * 注意: 维度的别名 join 在 applyFilters 中按需追加 (region/category/subCategory/state/segment/shipMode/dateFrom/dateTo)
 */
export const DIMENSION_BUILDERS: Record<DimensionKey, DimensionBuilder> = {
  // -------- query_sales / gen_chart 维度 --------
  region: {
    joins: (qb) =>
      qb.innerJoin("SalesOrder as o", "o.id", "s.orderId")
        .innerJoin("Customer as c", "c.id", "o.customerId"),
    key: sql<string>`c."region"`,
    label: "地区",
  },
  category: {
    joins: (qb) =>
      qb
        .innerJoin("Product as p", "p.id", "s.productId")
        // [M9-Bug C] 统一 join SalesOrder as o,让 dateFilter 的 o.orderDate 始终可用
        .innerJoin("SalesOrder as o", "o.id", "s.orderId"),
    key: sql<string>`p."category"`,
    label: "类别",
  },
  month: {
    joins: (qb) =>
      qb.innerJoin("SalesOrder as o", "o.id", "s.orderId"),
    key: sql<string>`to_char(o."orderDate", 'YYYY-MM')`,
    label: "月份",
  },

  // -------- query_details 维度 --------
  product: {
    joins: (qb) =>
      qb
        .innerJoin("Product as p", "p.id", "s.productId")
        // [M9-Bug C] 统一 join SalesOrder as o
        .innerJoin("SalesOrder as o", "o.id", "s.orderId"),
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
      qb
        .innerJoin("Product as p", "p.id", "s.productId")
        // [M9-Bug C] 统一 join SalesOrder as o
        .innerJoin("SalesOrder as o", "o.id", "s.orderId"),
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
// 指标 → SQL 聚合表达式 (query_details + gen_chart 共用)
// ============================================================
export type MetricKey = "sales" | "quantity" | "profit" | "discount" | "orderCount";

export const METRIC_SELECTORS: Record<MetricKey, RawBuilder<number>> = {
  sales: sql<number>`SUM(s."sales")`,
  quantity: sql<number>`SUM(s."quantity")`,
  profit: sql<number>`SUM(s."profit")`,
  discount: sql<number>`AVG(s."discount")`,
  orderCount: sql<number>`COUNT(DISTINCT o."id")`,
};

export const METRIC_LABELS: Record<MetricKey, string> = {
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
export function applyFilters(
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