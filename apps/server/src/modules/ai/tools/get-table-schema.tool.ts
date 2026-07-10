import { tool } from "@langchain/core/tools";
import { GetTableSchemaArgsSchema } from "./schemas";
import { DatasourceService } from "../../datasource/datasource.service";
import { MetadataCacheService } from "../../datasource/metadata/metadata-cache.service";
import { MetadataService } from "../../datasource/metadata/metadata.service";

/**
 * [Sprint 2] V3 — get_table_schema StructuredTool
 *
 * 当 system prompt 因 token 预算被截断、PlannerAgent 看不到某张表
 * 的完整字段信息时,LLM 调用本工具拉全量。
 *
 * 与 query_details/gen_chart 同构,接收 dataSourceId + table 名。
 * 走 MetadataCacheService(命中) 或 MetadataService.get(完整 introspect,
 * 慢但最新)。
 */
export function createGetTableSchemaTool(
  ds: DatasourceService,
  metadata: MetadataService,
  cache: MetadataCacheService,
  currentUserId: string, // [Sprint 5]
) {
  return tool(
    async (input: import("zod").infer<typeof GetTableSchemaArgsSchema>) => {
      try {
        // 1. [Sprint 5] ownership 校验
        const record = await ds.getByIdForUser(input.dataSourceId, currentUserId);
        if (!record) {
          return {
            error: `DataSource "${input.dataSourceId}" not found. Available data sources can be discovered via GET /api/datasources`,
          };
        }

        // 2. 从 cache 拿 snapshot(避免反复 introspect)
        let snapshot = cache.get(input.dataSourceId);
        if (!snapshot) {
          snapshot = await metadata.get(input.dataSourceId);
        }

        // 3. 找目标表
        const table = snapshot.tables.find(t => t.name === input.table);
        if (!table) {
          return {
            error: `Table "${input.table}" not found in DataSource "${input.dataSourceId}".`,
            availableTables: snapshot.tables.map(t => t.name),
          };
        }

        // 4. 返回全量列信息(列名 + 类型 + role + PK/FK + sample)
        return {
          dataSourceId: input.dataSourceId,
          table: {
            name: table.name,
            columns: table.columns.map(c => ({
              name: c.name,
              rawType: c.rawType,
              semanticRole: c.semanticRole,
              chineseName: c.chineseName,     // [Sprint 5.7]
              description: c.description,     // [Sprint 5.7]
              isPrimaryKey: c.isPrimaryKey,
              isForeignKey: c.isForeignKey,
              referencesTable: c.referencesTable,
              referencesColumn: c.referencesColumn,
              sampleValues: c.sampleValues,
            })),
            fkHints: table.fkHints,
          },
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "get_table_schema",
      description:
        "查看某张表的完整字段详情(列名、类型、是否主键/外键、sample 值)。" +
        "**当 system prompt 中表的字段被截断,或你需要确认某列是否存在 / 是否可过滤时调用本工具**。" +
        "调用后返回该表的全量列定义,可继续用于构造 query_details / gen_chart 的 QueryIntent。",
      schema: GetTableSchemaArgsSchema,
    },
  );
}