import { Injectable, Logger } from "@nestjs/common";
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserMessage,
} from "../prompts/analysis.prompt";
import { LlmService } from "../llm/llm.service";

/**
 * Cap data we send to the LLM. With 200+ rows the prompt balloons and
 * Qwen starts ignoring the instructions. 50 rows is plenty for an
 * analytical narrative.
 */
const MAX_ROWS_TO_LLM = 50;

/**
 * AnalysisAgent — Analysis Report
 *
 * Strategy:
 *   1. Send the user question + (truncated) data to Ollama.
 *   2. Return its narrative as the analysis string.
 *   3. On failure (timeout / parse error / Ollama down), fall back to
 *      the deterministic template so the user still gets *something*.
 */
@Injectable()
export class AnalysisAgent {
  private readonly logger = new Logger(AnalysisAgent.name);

  constructor(private readonly llm: LlmService) {}

  async generate(data: unknown[], message: string): Promise<string> {
    this.logger.log(`Generating analysis for ${data?.length ?? 0} records`);

    if (!data || data.length === 0) {
      return `针对问题"${message}",未查询到相关数据,无法生成分析。`;
    }

    try {
      const truncated =
        data.length > MAX_ROWS_TO_LLM ? data.slice(0, MAX_ROWS_TO_LLM) : data;
      const text = await this.llm.invoke({
        system: ANALYSIS_SYSTEM_PROMPT,
        human: buildAnalysisUserMessage(message, truncated),
        timeoutMs: 45_000,
        temperature: 0.2,
      });
      if (text) {
        return text;
      }
      throw new Error("LLM returned empty analysis");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`LLM analysis failed (${msg}); falling back to template`);
      return this.templateGenerate(data, message);
    }
  }

  /**
   * Deterministic fallback. Frozen behavior — used when LLM is down or
   * tests run without Ollama.
   */
  private templateGenerate(data: unknown[], message: string): string {
    const firstRow = data[0] as Record<string, unknown>;
    const columns = Object.keys(firstRow);

    const numericColumns = columns.filter((col) => {
      const value = firstRow[col];
      return typeof value === "number";
    });

    let summary = `针对问题"${message}",查询返回 ${data.length} 条记录,包含 ${columns.length} 个字段`;
    if (numericColumns.length > 0) {
      summary += `,其中数值字段为: ${numericColumns.join("、")}`;
    }
    summary += "。";

    let stats = "";
    if (numericColumns.length > 0) {
      const targetCol = numericColumns[0];
      const values = data
        .map((row) => Number((row as Record<string, unknown>)[targetCol]))
        .filter((v) => !Number.isNaN(v));

      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        stats = `\n\n数值字段 "${targetCol}" 统计:\n- 总和: ${sum.toFixed(2)}\n- 平均: ${avg.toFixed(2)}\n- 最大: ${max}\n- 最小: ${min}`;
      }
    }

    const closing =
      "\n\n注: 当前为基础模板输出,完整 LLM 驱动的深度分析将在 Ollama 可用时提供。";

    return summary + stats + closing;
  }
}