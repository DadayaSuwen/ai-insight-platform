import { z } from 'zod';

// ============================================================
// [Sprint 2] QueryIntent — Agent → QueryGateway 跨数据源协议
// ------------------------------------------------------------
// 设计:LLM 不再产出裸 SQL,也再不产出硬编码维度(/category/region/...)。
// 而是产出 QueryIntent(JSON,driver-agnostic),由 QueryGateway 翻译为
// PG/MySQL/DuckDB 方言 SQL。
//
// Sprint 1 仅 stub,Sprint 2 由 PlannerAgent 真实产出。
// ============================================================

export const IntentTypeSchema = z.enum([
  'aggregate', // 聚合(SUM/AVG/COUNT 等 + GROUP BY)
  'detail', // 明细行(SELECT * 或 SELECT specific columns)
  'timeseries', // 时序(aggregate + time dimension)
  'comparison', // 对比(两个 group 维度差值)
]);
export type IntentType = z.infer<typeof IntentTypeSchema>;

export const AggregationKindSchema = z.enum([
  'SUM',
  'AVG',
  'COUNT',
  'COUNT_DISTINCT',
  'MIN',
  'MAX',
]);
export type AggregationKind = z.infer<typeof AggregationKindSchema>;

export const JoinSpecSchema = z.object({
  /** 关联表名 */
  table: z.string().min(1),
  /** JOIN ON 原始 SQL 片段,需在网关层 sanitizeIdentifier 后入参 */
  on: z.string().min(1),
  /** 该表在当前查询中的别名 */
  alias: z.string().min(1),
});
export type JoinSpec = z.infer<typeof JoinSpecSchema>;

export const MetricSpecSchema = z.object({
  column: z.string().min(1),
  agg: AggregationKindSchema,
  /** 结果集字段别名,如 'total_sales' */
  alias: z.string().min(1),
  /** LLM 友好的人类可读标签,如 '总销售额' */
  label: z.string().min(1),
});
export type MetricSpec = z.infer<typeof MetricSpecSchema>;

export const FilterOpSchema = z.enum([
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'IN',
  'LIKE',
  'BETWEEN',
]);
export type FilterOp = z.infer<typeof FilterOpSchema>;

export const FilterSpecSchema = z.object({
  column: z.string().min(1),
  op: FilterOpSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});
export type FilterSpec = z.infer<typeof FilterSpecSchema>;

export const OrderBySpecSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['ASC', 'DESC']),
});
export type OrderBySpec = z.infer<typeof OrderBySpecSchema>;

export const QueryIntentSchema = z.object({
  dataSourceId: z.string().min(1),
  intentType: IntentTypeSchema,

  /** 主表(查询入口) */
  table: z.string().min(1),

  /** 关联表,默认空 */
  joins: z.array(JoinSpecSchema).default([]),

  /** GROUP BY 列(必填,空数组表示不聚合,直接 SELECT) */
  groupBy: z.array(z.string()).default([]),

  /** 聚合指标 */
  metrics: z.array(MetricSpecSchema).default([]),

  /** WHERE 条件 */
  filters: z.array(FilterSpecSchema).default([]),

  /** 排序 */
  orderBy: OrderBySpecSchema.optional(),

  /** 行数上限:最大 1000(强制安全护栏,即使 LLM 写大值,网关截断) */
  limit: z.number().int().positive().max(1000).default(100),
});
export type QueryIntent = z.infer<typeof QueryIntentSchema>;
