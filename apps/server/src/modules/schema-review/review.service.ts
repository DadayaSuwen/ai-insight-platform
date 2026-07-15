import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { MetadataService } from "../datasource/metadata/metadata.service";
import { SemanticInferenceService } from "../datasource/metadata/semantic-inference.service";
import { LlmService } from "../ai/llm/llm.service";
import { DatasourceService } from "../datasource/datasource.service";
import { z } from "zod";

/**
 * [Sprint 6] SchemaReviewService — Schema 纠错对话核心
 *
 * 流程:
 *   1. startReview() — 创建 review session, 计算所有字段置信度
 *   2. generateQuestion() — LLM 为最低置信度字段生成提问
 *   3. processAnswer() — 解析用户回答, 更新字段理解
 *   4. finalizeReview() — 敲定, 持久化 schemaUnderstanding
 */

interface ReviewMessage {
  role: "ai" | "user";
  content: string;
  fieldName?: string;
  quickReplies?: string[];
  ts: string;
}

export interface PendingField {
  table: string;
  field: string;
  rawType: string;
  currentGuess: string;
  confidence: number;
  sampleValues: string[];
}

/* ─── Zod schemas for LLM structured output ─── */

const QuestionSchema = z.object({
  question: z.string(),
  fieldName: z.string(),
  tableName: z.string(),
  quickReplies: z.array(z.string()).min(2).max(4),
  evidence: z.string(),
});

const AnswerParseSchema = z.object({
  fieldName: z.string(),
  chineseName: z.string(),
  role: z.enum(["dimension", "measure", "time", "identifier"]),
  description: z.string(),
  isSensitive: z.boolean().default(false),
});

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly meta: MetadataService,
    private readonly semanticInference: SemanticInferenceService,
    private readonly llm: LlmService,
    private readonly ds: DatasourceService,
  ) {}

  /**
   * 启动纠错会话 — 分析所有字段置信度, 创建 SchemaReview 记录
   */
  async startReview(datasourceId: string, userId: string) {
    // 校验所有权
    const dsRecord = await this.ds.getByIdForUser(datasourceId, userId);
    if (!dsRecord) throw new Error("DataSource not found");

    const snapshot = await this.meta.get(datasourceId);

    // 收集所有字段并计算置信度
    const pendingFields: PendingField[] = [];

    for (const table of snapshot.tables) {
      for (const col of table.columns) {
        const confidence = this.semanticInference.computeConfidence({
          name: col.name,
          rawType: col.rawType,
          chineseName: col.chineseName,
          semanticRole: col.semanticRole,
        });

        if (confidence < SemanticInferenceService.CONFIDENCE_THRESHOLD) {
          pendingFields.push({
            table: table.name,
            field: col.name,
            rawType: col.rawType,
            currentGuess: col.chineseName ?? col.name,
            confidence,
            sampleValues: (col.sampleValues as string[] | undefined)?.slice(0, 10) ?? [],
          });
        }
      }
    }

    // 创建 review session
    const created = await this.db.db
      .insertInto("SchemaReview")
      .values({
        datasourceId,
        status: "active",
        pendingFields: pendingFields.length,
        confirmedFields: 0,
        messages: [] as unknown as Record<string, unknown>,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 更新 DataSource 状态
    await this.db.db
      .updateTable("DataSource")
      .set({ exploreStatus: "reviewing" })
      .where("id", "=", datasourceId)
      .execute();

    this.logger.log(
      `Review started for ${datasourceId}: ${pendingFields.length} pending fields`,
    );

    return {
      reviewId: created.id,
      pendingFields: pendingFields.length,
      fields: pendingFields,
    };
  }

  /**
   * 获取待确认字段列表
   */
  async getPendingFields(reviewId: string): Promise<PendingField[]> {
    const review = await this.db.db
      .selectFrom("SchemaReview")
      .selectAll()
      .where("id", "=", reviewId)
      .executeTakeFirst();

    if (!review) throw new Error("Review not found");

    // 从 messages JSON 重建待确认字段
    const messages = (review.messages as unknown as ReviewMessage[]) ?? [];
    const confirmedFields = new Set(
      messages
        .filter((m) => m.role === "ai" && m.content.includes("✓"))
        .map((m) => m.fieldName)
        .filter(Boolean),
    );

    // 重新获取 snapshot 计算当前 pending
    const snapshot = await this.meta.get(review.datasourceId as string);
    const fields: PendingField[] = [];

    for (const table of snapshot.tables) {
      for (const col of table.columns) {
        if (confirmedFields.has(`${table.name}.${col.name}`)) continue;

        const confidence = this.semanticInference.computeConfidence({
          name: col.name,
          rawType: col.rawType,
          chineseName: col.chineseName,
          semanticRole: col.semanticRole,
        });

        if (confidence < SemanticInferenceService.CONFIDENCE_THRESHOLD) {
          fields.push({
            table: table.name,
            field: col.name,
            rawType: col.rawType,
            currentGuess: col.chineseName ?? col.name,
            confidence,
            sampleValues: (col.sampleValues as string[] | undefined)?.slice(0, 10) ?? [],
          });
        }
      }
    }

    return fields;
  }

  /**
   * LLM 生成下一个提问 — 选择置信度最低的字段
   */
  async generateQuestion(reviewId: string): Promise<{
    question: string;
    fieldName: string;
    tableName: string;
    quickReplies: string[];
    evidence: string;
    remaining: number;
  } | null> {
    const fields = await this.getPendingFields(reviewId);
    if (fields.length === 0) return null;

    // [Fix-9 Task 9.5] 检查 LLM 是否已配置
    const llmConfig = await this.db.db
      .selectFrom("LLMConfig")
      .selectAll()
      .orderBy("updatedAt", "desc")
      .executeTakeFirst();

    if (!llmConfig || !llmConfig.apiKey) {
      return {
        question:
          "⚠️ LLM 未配置，无法生成提问。请先在「模型配置」页面配置 API Key。",
        fieldName: "",
        tableName: "",
        quickReplies: [],
        evidence: "",
        remaining: fields.length,
      };
    }

    // 选置信度最低的
    const target = fields.reduce((a, b) =>
      a.confidence < b.confidence ? a : b,
    );

    const review = await this.db.db
      .selectFrom("SchemaReview")
      .selectAll()
      .where("id", "=", reviewId)
      .executeTakeFirst();

    if (!review) throw new Error("Review not found");

    try {
      const result = await this.llm.invokeStructured({
        system:
          "你是数据库 Schema 分析专家。对不确定的字段向用户提问确认。",
        human: `请为以下字段生成一个简洁的确认提问：

表名: ${target.table}
字段名: ${target.field}
类型: ${target.rawType}
当前推测: ${target.currentGuess}
置信度: ${(target.confidence * 100).toFixed(0)}%
抽样值: ${target.sampleValues.slice(0, 5).join(", ") || "无"}

要求:
- 提问要具体, 引用抽样值作为证据
- 提供 2-4 个快捷回复选项
- 如果字段看起来像枚举(抽样值重复多), 直接问枚举含义
- 如果字段名模糊(如 "amt", "code", "flag"), 问具体业务含义
- 如果字段可能是敏感信息, 问是否敏感`,
        schema: QuestionSchema,
        temperature: 0.3,
        timeoutMs: 15_000,
      });

      // 保存消息
      const messages = (review.messages as unknown as ReviewMessage[]) ?? [];
      messages.push({
        role: "ai",
        content: result.question,
        fieldName: `${result.tableName}.${result.fieldName}`,
        quickReplies: result.quickReplies,
        ts: new Date().toISOString(),
      });
      await this.db.db
        .updateTable("SchemaReview")
        .set({ messages: messages as unknown as Record<string, unknown> })
        .where("id", "=", reviewId)
        .execute();

      return {
        question: result.question,
        fieldName: result.fieldName,
        tableName: result.tableName,
        quickReplies: result.quickReplies,
        evidence: result.evidence,
        remaining: fields.length,
      };
    } catch (err) {
      this.logger.warn(`Question generation failed: ${(err as Error).message}`);
      // fallback: 生成基本提问
      return {
        question: `关于 ${target.table}.${target.field} (${target.rawType}), 当前推测为「${target.currentGuess}」。请确认其业务含义。`,
        fieldName: target.field,
        tableName: target.table,
        quickReplies: [
          `就是「${target.currentGuess}」`,
          `不对，应该是...`,
          "这个字段不重要，跳过",
        ],
        evidence: `抽样值: ${target.sampleValues.slice(0, 5).join(", ") || "无"}`,
        remaining: fields.length,
      };
    }
  }

  /**
   * 处理用户回答 — LLM 解析 → 更新字段理解
   *
   * [Fix-1 Task 1.2] 增加 userId 参数 + 归属校验, 防止越权
   */
  async processAnswer(
    reviewId: string,
    answer: string,
    userId: string,
  ): Promise<{
    updated: { table: string; field: string; chineseName: string; role: string } | null;
    remaining: number;
  }> {
    const review = await this.getReviewOwnedByUser(reviewId, userId);

    // 保存用户消息
    const messages = (review.messages as unknown as ReviewMessage[]) ?? [];
    messages.push({ role: "user", content: answer, ts: new Date().toISOString() });

    // 找到当前提问的字段
    const lastQuestion = [...messages]
      .reverse()
      .find((m) => m.role === "ai" && m.fieldName);
    const targetField = lastQuestion?.fieldName ?? "";

    if (!targetField) {
      await this.db.db
        .updateTable("SchemaReview")
        .set({ messages: messages as unknown as Record<string, unknown> })
        .where("id", "=", reviewId)
        .execute();
      return { updated: null, remaining: review.pendingFields as number };
    }

    const [tableName, fieldName] = targetField.split(".");

    try {
      const parsed = await this.llm.invokeStructured({
        system: "你是数据架构师。解析用户对字段的确认回答。",
        human: `用户回答: "${answer}"

字段: ${targetField}

请解析用户意图:
- 如果用户确认了或给出了业务含义, 输出 chineseName 和 role
- 如果用户说"跳过"或"不重要", chineseName 用字段名, role=identifier
- 如果用户说敏感, 标记 isSensitive=true`,
        schema: AnswerParseSchema,
        temperature: 0,
        timeoutMs: 10_000,
      });

      // 更新 connectionConfig 中的 columnAliases
      const dsRecord = await this.ds.getById(
        review.datasourceId as string,
      );
      if (dsRecord) {
        const config = (dsRecord.connectionConfig as Record<string, unknown>) ?? {};
        const aliases = (config.columnAliases as Record<string, unknown>) ?? {};
        // 论文创新点 #2：持久化用户对字段语义的完整纠正（不只 chineseName）
        aliases[parsed.fieldName] = {
          chineseName: parsed.chineseName,
          role: parsed.role,             // 用户纠正的语义角色
          description: parsed.description, // 用户补充的描述
        };
        config.columnAliases = aliases;

        await this.db.db
          .updateTable("DataSource")
          .set({
            connectionConfig: config,
            updatedAt: new Date(),
          })
          .where("id", "=", review.datasourceId as string)
          .execute();
      }

      // 更新 review 状态
      const doneMsg = `✓ 已确认 ${targetField} →「${parsed.chineseName}」role=${parsed.role}${parsed.isSensitive ? " (敏感)" : ""}`;
      messages.push({
        role: "ai",
        content: doneMsg,
        fieldName: targetField,
        ts: new Date().toISOString(),
      });

      const remaining = await this.countRemaining(review.datasourceId as string, messages);

      await this.db.db
        .updateTable("SchemaReview")
        .set({
          messages: messages as unknown as Record<string, unknown>,
          confirmedFields: (review.confirmedFields as number) + 1,
          pendingFields: remaining,
        })
        .where("id", "=", reviewId)
        .execute();

      this.logger.log(`Field confirmed: ${targetField} → ${parsed.chineseName}`);

      return {
        updated: {
          table: tableName,
          field: fieldName,
          chineseName: parsed.chineseName,
          role: parsed.role,
        },
        remaining,
      };
    } catch (err) {
      this.logger.warn(`Answer parsing failed: ${(err as Error).message}`);
      // simple fallback
      messages.push({
        role: "ai",
        content: `✓ 已记录你对 ${targetField} 的说明。`,
        fieldName: targetField,
        ts: new Date().toISOString(),
      });

      await this.db.db
        .updateTable("SchemaReview")
        .set({
          messages: messages as unknown as Record<string, unknown>,
          confirmedFields: (review.confirmedFields as number) + 1,
          pendingFields: Math.max(0, (review.pendingFields as number) - 1),
        })
        .where("id", "=", reviewId)
        .execute();

      return {
        updated: { table: tableName, field: fieldName, chineseName: answer.slice(0, 30), role: "dimension" },
        remaining: Math.max(0, (review.pendingFields as number) - 1),
      };
    }
  }

  /**
   * 敲定 — 持久化 schemaUnderstanding 到 DataSource
   *
   * [Fix-1 Task 1.2] 增加 userId 参数 + 归属校验, 防止越权
   */
  async finalizeReview(reviewId: string, userId: string): Promise<{
    schemaUnderstanding: Record<string, unknown>;
  }> {
    const review = await this.getReviewOwnedByUser(reviewId, userId);

    const snapshot = await this.meta.get(review.datasourceId as string);

    // 构建 schemaUnderstanding
    const understanding: Record<string, unknown> = {
      finalizedAt: new Date().toISOString(),
      tables: snapshot.tables.map((t) => ({
        name: t.name,
        rowCount: t.rowCount,
        columns: t.columns.map((c) => ({
          name: c.name,
          rawType: c.rawType,
          chineseName: c.chineseName,
          semanticRole: c.semanticRole,
          description: c.description,
        })),
      })),
    };

    await this.db.db
      .updateTable("DataSource")
      .set({
        exploreStatus: "finalized",
        schemaUnderstanding: understanding,
        updatedAt: new Date(),
      })
      .where("id", "=", review.datasourceId as string)
      .execute();

    await this.db.db
      .updateTable("SchemaReview")
      .set({ status: "finalized", finalizedAt: new Date() })
      .where("id", "=", reviewId)
      .execute();

    this.logger.log(
      `Review finalized for ${review.datasourceId as string}`,
    );

    return { schemaUnderstanding: understanding };
  }

  /* ─── helpers ─── */

  private async countRemaining(
    datasourceId: string,
    messages: ReviewMessage[],
  ): Promise<number> {
    const confirmedFields = new Set(
      messages
        .filter((m) => m.role === "ai" && m.content.includes("✓"))
        .map((m) => m.fieldName)
        .filter(Boolean),
    );

    const snapshot = await this.meta.get(datasourceId);
    let count = 0;
    for (const table of snapshot.tables) {
      for (const col of table.columns) {
        if (confirmedFields.has(`${table.name}.${col.name}`)) continue;
        const confidence = this.semanticInference.computeConfidence({
          name: col.name,
          rawType: col.rawType,
          chineseName: col.chineseName,
          semanticRole: col.semanticRole,
        });
        if (confidence < SemanticInferenceService.CONFIDENCE_THRESHOLD) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * [Fix-1 Task 1.2] 校验 review 归属：review 必须属于该用户 + 关联的 datasource 也属于该用户
   * 越权 → 抛 NotFound(不泄露存在性, 与 DatasourceService.getByIdForUser 行为一致)
   */
  private async getReviewOwnedByUser(reviewId: string, userId: string) {
    const review = await this.db.db
      .selectFrom("SchemaReview")
      .selectAll()
      .where("id", "=", reviewId)
      .executeTakeFirst();

    if (!review) throw new NotFoundException("Review not found");

    // 通过 datasource 校验归属 — 越权时 getByIdForUser 返回 null → 抛 NotFound
    const ds = await this.ds.getByIdForUser(review.datasourceId as string, userId);
    if (!ds) throw new NotFoundException("Review not found");

    return review;
  }
}
