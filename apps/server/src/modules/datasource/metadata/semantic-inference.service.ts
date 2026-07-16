import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type { ColumnMetadata, SemanticRole } from "@workspace/types";
import { LlmService } from "../../ai/llm/llm.service";
import { inferSemantics } from "./infer-semantics";

/**
 * [Sprint 5.7] LLM 语义推断服务
 *
 * 职责:
 *   在数据源注册/内省后,调用轻量级 LLM 为每个字段推断:
 *   - chineseName: 中文业务名称 (如 "订单金额")
 *   - role: dimension / measure / time / identifier
 *   - description: 一句话描述
 *
 * 防滥用:
 *   - 最多处理 50 列 (超出部分保留规则推断结果)
 *   - 采样值全 NULL 时默认 role=identifier, chineseName=physicalName
 *   - LLM 调用失败时降级为纯规则推断 (不阻断注册流程)
 */

/** LLM 返回的单列推断结果 — [Sprint 6] 增加 confidence */
const InferredColumnSchema = z.object({
  name: z.string(),
  chineseName: z.string(),
  role: z.enum(["dimension", "measure", "time", "identifier"]),
  description: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const InferredColumnsSchema = z.array(InferredColumnSchema);

type InferredColumn = z.infer<typeof InferredColumnSchema>;

/** 最多提交给 LLM 的列数 */
const MAX_COLUMNS_FOR_LLM = 50;

@Injectable()
export class SemanticInferenceService {
  private readonly logger = new Logger(SemanticInferenceService.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * 对一张表的所有列做 LLM 语义推断。
   *
   * @returns 增强后的列数组 (含 chineseName / description, role 可能被覆盖)
   *          失败时返回 null, 调用方应降级为规则推断结果
   */
  async inferColumns(
    columns: ColumnMetadata[],
    tableName: string,
  ): Promise<ColumnMetadata[] | null> {
    if (!columns || columns.length === 0) return columns;

    // 只提交前 50 列给 LLM (防滥用)
    const submitColumns = columns.slice(0, MAX_COLUMNS_FOR_LLM);
    const restColumns = columns.slice(MAX_COLUMNS_FOR_LLM);

    try {
      const prompt = this.buildPrompt(submitColumns, tableName);
      const inferred = await this.llm.invokeStructured({
        system: "你是数据架构师，擅长为数据库字段推断中文语义。",
        human: prompt,
        schema: InferredColumnsSchema,
        temperature: 0, // 确定性输出
        timeoutMs: 15_000, // 3 秒内完成
      });

      // 按 name 匹配回原列
      const inferredMap = new Map<string, InferredColumn>(
        inferred.map((inf) => [inf.name, inf]),
      );

      const enhanced = submitColumns.map((col) => {
        const inf = inferredMap.get(col.name);
        if (!inf) {
          // LLM 没返回这一列 → 保留规则推断, chineseName 默认 = name
          return {
            ...col,
            chineseName: col.chineseName ?? col.name,
            description: col.description ?? "",
          };
        }
        return {
          ...col,
          chineseName: inf.chineseName || col.name,
          semanticRole: (inf.role as SemanticRole) || col.semanticRole,
          description: inf.description || "",
        };
      });

      this.logger.log(
        `Semantic inference OK: ${enhanced.length} columns for table "${tableName}"`,
      );

      // 超出 50 列的部分保持规则推断
      if (restColumns.length > 0) {
        this.logger.warn(
          `Table "${tableName}" has ${columns.length} columns; only first ${MAX_COLUMNS_FOR_LLM} were inferred by LLM`,
        );
        return [
          ...enhanced,
          ...restColumns.map((c) => ({
            ...c,
            chineseName: c.chineseName ?? c.name,
            description: c.description ?? "",
          })),
        ];
      }

      return enhanced;
    } catch (err) {
      this.logger.warn(
        `Semantic inference failed for table "${tableName}", falling back to rule-based: ${(err as Error).message}`,
      );
      return null; // 降级: 用规则推断
    }
  }

  /**
   * [Sprint 5.7+] 轻量级: 仅推断中文别名 (预览阶段使用)
   *
   * 不处理完整 ColumnMetadata,只接受列名 + 采样值,返回 物理名 → 中文别名 映射。
   * 用于 CSV 上传预览 Modal 中展示给用户确认。
   */
  async inferAliases(
    columns: Array<{ name: string; samples: string[] }>,
    tableName: string,
  ): Promise<Record<string, string> | null> {
    if (!columns || columns.length === 0) return {};
    const submitColumns = columns.slice(0, MAX_COLUMNS_FOR_LLM);

    try {
      const fieldLines = submitColumns
        .map((c) => {
          const samples =
            c.samples.length > 0
              ? `samples: [${c.samples.slice(0, 5).join(", ")}]`
              : "samples: (无)";
          return `- name: ${c.name}, ${samples}`;
        })
        .join("\n");

      const prompt = `请为以下字段推断中文别名，返回 JSON 对象 {aliases: {"物理名": "中文别名"}}。

表名: ${tableName}
${fieldLines}

规则:
- 中文别名应简洁、业务化（如 order_amt → "订单金额"）
- 如果无法推断，直接用物理名
- 只返回 JSON，不要额外文字`;

      const schema = z.object({
        aliases: z.record(z.string(), z.string()),
      });

      const result = await this.llm.invokeStructured({
        system: "你是数据架构师。为数据库字段推断中文别名。",
        human: prompt,
        schema,
        temperature: 0,
        timeoutMs: 10_000,
      });

      this.logger.log(`Alias inference OK for "${tableName}": ${Object.keys(result.aliases).length} aliases`);
      return result.aliases;
    } catch (err) {
      this.logger.warn(
        `Alias inference failed for "${tableName}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 回退: 在没有 LLM 结果时为所有列设置默认 chineseName
   */
  fallbackColumns(columns: ColumnMetadata[]): ColumnMetadata[] {
    return columns.map((c) => ({
      ...c,
      chineseName: c.chineseName ?? c.name,
      description: c.description ?? "",
    }));
  }

  /* ───────── 内部 helpers ───────── */

  private buildPrompt(
    columns: ColumnMetadata[],
    tableName: string,
  ): string {
    const fieldLines = columns
      .map((c) => {
        const samples =
          c.sampleValues.length > 0
            ? `samples: [${c.sampleValues.slice(0, 5).join(", ")}]`
            : "samples: (无采样值)";
        return `- name: ${c.name}, type: ${c.rawType}, ${samples}`;
      })
      .join("\n");

    return `请分析以下数据库字段的物理名和采样值，为每个字段推断：

1. chineseName: 中文业务名称（如 "订单金额"、"员工姓名"、"创建日期"）
2. role: dimension（维度，用于分组筛选）/ measure（指标，用于聚合计算）/ time（时间）/ identifier（标识，如 ID）
3. description: 一句话描述该字段的业务含义

表名: ${tableName}

字段列表:
${fieldLines}

返回 JSON 数组:
[
  {"name": "order_amt", "chineseName": "订单金额", "role": "measure", "description": "每笔订单的总金额"},
  ...
]

注意：
- 如果采样值全是 NULL 或空，chineseName 使用 physicalName 原文，role 设为 identifier
- 如果是日期/时间戳类型，role 应设为 time
- 如果是数值类型（含小数），一般设为 measure
- 如果是短文本且有明显的枚举特征（如 "男"/"女"），一般设为 dimension`;
  }

  /**
   * [Sprint 6] 计算字段置信度 (0-1)
   *
   * 基于启发式规则:
   *   - name 清晰度: 含常见词 (id/name/date/time/amount/price/count/status/type/category) → +0.3
   *   - 采样值分布: 有明确模式 (枚举/日期/数值) → +0.2
   *   - LLM 推断一致性: chineseName ≠ physicalName 且 role 确定 → +0.3
   *   - 基础分: 0.2
   *
   * 阈值 >= 0.85 → 自动确认; < 0.85 → 需要用户确认
   */
  computeConfidence(col: {
    name: string;
    rawType: string;
    chineseName?: string;
    semanticRole?: string;
  }): number {
    let score = 0.2; // 基础分

    const name = col.name.toLowerCase();

    // name 清晰度
    const clearPatterns = [
      /\bid\b/, /\bname\b/, /\bdate\b/, /\btime\b/,
      /\bamount\b/, /\bprice\b/, /\bcount\b/, /\bqty\b/,
      /\bstatus\b/, /\btype\b/, /\bcategor/i,
      /\bemail\b/, /\bphone\b/, /\baddress\b/,
      /\bcreated\b/, /\bupdated\b/, /\bdeleted\b/,
    ];
    const hasClearPattern = clearPatterns.some((p) => p.test(name));
    if (hasClearPattern) score += 0.3;

    // 采样值分布 (通过 rawType 推断)
    const typeLower = (col.rawType || "").toLowerCase();
    if (
      typeLower.includes("int") ||
      typeLower.includes("decimal") ||
      typeLower.includes("numeric") ||
      typeLower.includes("float") ||
      typeLower.includes("double")
    ) {
      score += 0.15; // 数值类型 → 很可能是 measure
    } else if (
      typeLower.includes("timestamp") ||
      typeLower.includes("date")
    ) {
      score += 0.25; // 时间类型 → 很可能是 time
    } else if (
      typeLower.includes("bool")
    ) {
      score += 0.2; // 布尔 → 维度
    } else if (
      typeLower.includes("varchar") ||
      typeLower.includes("text") ||
      typeLower.includes("char")
    ) {
      // 短文本 → 可能是维度, 但不确定性更高
      score += 0.1;
    }

    // LLM 推断一致性
    if (col.chineseName && col.chineseName !== col.name) {
      score += 0.2;
    }
    if (
      col.semanticRole &&
      col.semanticRole !== "identifier"
    ) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  /** 置信度阈值 — >= 此值自动确认 */
  static readonly CONFIDENCE_THRESHOLD = 0.85;
}
