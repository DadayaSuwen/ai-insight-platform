import { Injectable, Logger } from "@nestjs/common";
import type { MetadataSnapshot } from "@workspace/types";
import { serializeForPrompt } from "../security/token-budget";
import { ExecutorFactory } from "../executors/executor.factory";
import { DatasourceService } from "../datasource.service";
import { MetadataCacheService } from "./metadata-cache.service";
import { inferSemantics } from "./infer-semantics";
import { SemanticInferenceService } from "./semantic-inference.service";

/**
 * [Sprint 1 / V3] 元数据服务
 *
 * 职责:
 *   1. introspect(dataSourceId) — 调 executor 读 schema + sample
 *   2. inferSemantics()         — 见 infer-semantics.ts (本文件不再重复)
 *   3. get()                    — 读 cache,miss 时调 introspect + cache
 *   4. serializeForPrompt()     — 用 token-budget 渲染注入到 LLM 的字符串
 *
 * Sprint 1 期间 PlannerAgent 不调这里。Sprint 2 由 PlannerAgent 调用。
 */
@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);

  constructor(
    private readonly factory: ExecutorFactory,
    private readonly ds: DatasourceService,
    private readonly cache: MetadataCacheService,
    private readonly semanticInference: SemanticInferenceService,
  ) {}

  /**
   * 主入口:读 cache → miss 时跑 introspect → cache → infer。
   *
   * 显式 `refresh=true` 用于 /api/datasources/:id/refresh 端点,
   * 此时跳过 cache。
   */
  async get(
    dataSourceId: string,
    options: { refresh?: boolean } = {},
  ): Promise<MetadataSnapshot> {
    if (!options.refresh) {
      const cached = this.cache.get(dataSourceId);
      if (cached) return cached;
    }

    const record = await this.ds.getById(dataSourceId);
    if (!record) {
      throw new Error(`DataSource not found: ${dataSourceId}`);
    }

    // [Sprint 4] executor 创建前解密 connectionConfig.password
    const decrypted = this.ds.decryptConfigForExecutor(
      record.connectionConfig as unknown as Parameters<ExecutorFactory["create"]>[1],
    );

    // [Sprint 5.6] executor 由 ExecutorFactory 池管理生命周期,
    // 这里只 introspect, 不 dispose — 否则后续查询拿到已销毁的连接
    const executor = this.factory.create(dataSourceId, decrypted);
    const raw = await executor.introspect();
    const inferred = inferSemantics(raw);

    // [Sprint 5.7+] 读取用户确认的中文别名 (注册时保存,优先级最高)
    // [Fix-1 Task 1.4] 兼容旧格式(纯字符串 chineseName) + 新格式({chineseName, role, description})
    const config = record.connectionConfig as Record<string, unknown>;
    const columnAliases = (config?.columnAliases as Record<string, unknown>) ?? {};

    // [Sprint 5.7] LLM 语义推断 (在规则推断之后,覆盖 role + 补充 chineseName/description)
    for (const table of inferred.tables) {
      const llmResult = await this.semanticInference
        .inferColumns(table.columns, table.name)
        .catch((err) => {
          this.logger.warn(
            `Semantic inference failed for table "${table.name}", using rule-based: ${(err as Error).message}`,
          );
          return null; // 降级: 不阻断
        });

      if (llmResult) {
        table.columns = llmResult;
      } else {
        // LLM 失败 → 用默认 chineseName (physicalName)
        table.columns = this.semanticInference.fallbackColumns(table.columns);
      }
    }

    // [Sprint 5.7+] 用户确认的中文别名覆盖 LLM 推断 (最高优先级)
    // [Fix-1 Task 1.4] 兼容旧格式(纯字符串 chineseName) + 新格式({chineseName, role, description})
    if (Object.keys(columnAliases).length > 0) {
      for (const table of inferred.tables) {
        for (const col of table.columns) {
          const alias = columnAliases[col.name];
          if (alias == null) continue;
          if (typeof alias === "string") {
            // 旧格式：纯字符串 chineseName
            col.chineseName = alias;
          } else if (typeof alias === "object") {
            // 新格式：{ chineseName, role, description }
            const obj = alias as {
              chineseName?: string;
              role?: string;
              description?: string;
            };
            if (obj.chineseName) col.chineseName = obj.chineseName;
            // role 是字面量联合类型, 收窄到 4 个允许值
            if (
              obj.role === "dimension" ||
              obj.role === "measure" ||
              obj.role === "time" ||
              obj.role === "identifier"
            ) {
              col.semanticRole = obj.role;
            }
            if (obj.description) col.description = obj.description;
          }
        }
      }
    }

    this.cache.set(dataSourceId, inferred);
    // 持久化最近一份 snapshot 到 Prisma (供审计)
    await this.ds.persistSnapshot(inferred);
    this.logger.log(
      `Metadata[${dataSourceId}] cached: ${inferred.tables.length} tables`,
    );
    return inferred;
  }

  /**
   * 快捷入口:直接产出可注入到 PlannerAgent system prompt 的字符串。
   */
  async serializeForPrompt(dataSourceId: string): Promise<string> {
    const snap = await this.get(dataSourceId);
    const out = serializeForPrompt(snap);
    return out.text;
  }
}
