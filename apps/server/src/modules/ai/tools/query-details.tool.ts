import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
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
 *
 * [Sprint 5.7] 重构为 class-based StructuredTool：
 *   - 原 tool() 函数返回对象时被隐式 toString() 为 [object Object],
 *     LLM 无法读取查询结果 → 回退为元数据盲猜 → "暂时无法从数据库中拉取数据"
 *   - StructuredTool._call() 显式返回 JSON.stringify(result),
 *     PlannerAgent 端通过 JSON.parse 还原为对象（已有逻辑，无需改动）
 *   - 依赖注入移入 constructor,每次 PlannerAgent.buildTools() 时 new
 */
export class QueryDetailsTool extends StructuredTool {
  name = "query_details";

  description =
    "**V3 通用查询工具**:对当前会话绑定的数据源执行任意维度的 SQL 聚合/明细查询。" +
    "传入 table 名 + groupBy 列 + metrics (聚合表达式) + filters (WHERE 条件) + topN。" +
    "**必须**先确认 system prompt 中的 MetadataSnapshot 列出该 table 与 column;若看不到全量字段,先调 get_table_schema。";

  schema = QueryDetailsArgsSchema;

  constructor(
    private readonly ds: DatasourceService,
    private readonly metadataService: MetadataService,
    private readonly gateway: QueryGatewayService,
    private readonly currentUserId: string, // [Sprint 5]
  ) {
    super();
  }

  async _call(input: QueryDetailsArgs): Promise<string> {
    try {
      const record = await this.ds.getByIdForUser(
        input.dataSourceId,
        this.currentUserId,
      );
      if (!record) {
        return JSON.stringify({
          error: `DataSource "${input.dataSourceId}" not found`,
        });
      }
      const snapshot = await this.metadataService.get(input.dataSourceId);

      const intent: QueryIntent = {
        dataSourceId: input.dataSourceId,
        intentType: "aggregate",
        table: input.table,
        joins: [],
        groupBy: input.groupBy,
        metrics: input.metrics.map((m) => ({
          column: m.column,
          agg: m.agg,
          alias: m.alias,
          label: m.label,
        })),
        filters: input.filters,
        orderBy: input.orderBy,
        limit:
          input.groupBy.length === 0 ? Math.min(input.topN, 50) : input.topN,
      };

      // [Sprint 5] 传入 currentUserId
      const result = await this.gateway.executeIntent(
        input.dataSourceId,
        this.currentUserId,
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
        intent.metrics.map((m) => m.alias),
        metricLabels,
      );
      return JSON.stringify({
        dataSourceId: input.dataSourceId,
        table: intent.table,
        groupByField: intent.groupBy.join(","),
        metrics: intent.metrics.map((m) => m.alias),
        metricLabels,
        rows: result.rows,
        // [本次] 透出 sql + 耗时 + 行数,供前端单卡渲染用
        // totalRows → rowCount: 与前端 SSE schema (SSEToolResultDataSchema.rowCount) 对齐
        rowCount: result.rowCount,
        durationMs: result.durationMs,
        sql: result.sql,
        fieldMapping,
      });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
