import { tool } from "@langchain/core/tools";
import { QueryDetailsArgsSchema, type QueryDetailsArgs } from "./schemas";
import { DatasourceService } from "../../datasource/datasource.service";
import { MetadataService } from "../../datasource/metadata/metadata.service";
import { QueryGatewayService } from "../../datasource/query-gateway/query-gateway.service";
import type { QueryIntent } from "@workspace/types";
import { buildFieldMapping } from "./field-mapping";

/**
 * [Sprint 2] V3 query_details — 跨数据源通用聚合工具
 *
 * 接收 dataSourceId + 任意 table / column 名 (string),完全元数据驱动。
 *
 * 链路:
 *   LLM args → buildIntent(args) → QueryGateway.executeIntent()
 *     → validateIntent → translate → sql-guard → executor.executeRaw
 *     → rows
 */
export function createQueryDetailsTool(
  ds: DatasourceService,
  metadata: MetadataService,
  gateway: QueryGatewayService,
  currentUserId: string, // [Sprint 5]
) {
  return tool(
    async (input: QueryDetailsArgs) => {
      try {
        const record = await ds.getByIdForUser(input.dataSourceId, currentUserId);
        if (!record) {
          return {
            error: `DataSource "${input.dataSourceId}" not found`,
          };
        }
        const snapshot = await metadata.get(input.dataSourceId);

        const intent: QueryIntent = {
          dataSourceId: input.dataSourceId,
          intentType: "aggregate",
          table: input.table,
          joins: [],
          groupBy: input.groupBy,
          metrics: input.metrics.map(m => ({
            column: m.column,
            agg: m.agg,
            alias: m.alias,
            label: m.label,
          })),
          filters: input.filters,
          orderBy: input.orderBy,
          limit:
            input.groupBy.length === 0
              ? Math.min(input.topN, 50)
              : input.topN,
        };

        // [Sprint 5] 传入 currentUserId
        const result = await gateway.executeIntent(
          input.dataSourceId,
          currentUserId,
          intent,
          snapshot,
        );

        const metricLabels = intent.metrics.reduce(
          (acc, m) => ({ ...acc, [m.alias]: m.label }),
          {} as Record<string, string>,
        );
        // [Sprint 5.7] 构建 fieldMapping: 物理名 → 中文名
        const fieldMapping = buildFieldMapping(
          snapshot,
          intent.table,
          intent.metrics.map(m => m.alias),
          metricLabels,
        );
        return {
          dataSourceId: input.dataSourceId,
          table: intent.table,
          groupByField: intent.groupBy.join(","),
          metrics: intent.metrics.map(m => m.alias),
          metricLabels,
          rows: result.rows,
          // [本次] 透出 sql + 耗时 + 行数,供前端单卡渲染用
          // totalRows → rowCount: 与前端 SSE schema (SSEToolResultDataSchema.rowCount) 对齐
          rowCount: result.rowCount,
          durationMs: result.durationMs,
          sql: result.sql,
          fieldMapping,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "query_details",
      description:
        "**V3 通用查询工具**:对当前会话绑定的数据源执行任意维度的 SQL 聚合/明细查询。" +
        "传入 table 名 + groupBy 列 + metrics (聚合表达式) + filters (WHERE 条件) + topN。" +
        "**必须**先确认 system prompt 中的 MetadataSnapshot 列出该 table 与 column;若看不到全量字段,先调 get_table_schema。",
      schema: QueryDetailsArgsSchema,
    },
  );
}