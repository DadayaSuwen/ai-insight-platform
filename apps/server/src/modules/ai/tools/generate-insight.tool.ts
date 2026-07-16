import { StructuredTool } from "@langchain/core/tools";
import { GenerateInsightArgsSchema } from "./schemas";
import { InsightAgent } from "../agents/insight.agent";
import { ToolResultContext } from "./tool-result.context";

/**
 * generate_insight 工具
 *
 * Agent-as-a-Tool 模式:
 *  - 上层 Planner 看到的是 StructuredTool 接口
 *  - 内部调用 InsightAgent.generate() 做二次 LLM pass
 *
 * 上下文兜底(架构师审查 Pitfall #2):
 *  - LLM 可能不会把上一步完整数据塞进 `data` 参数
 *  - 这里从 ToolResultContext 拿最近一条数据类工具的结果作 fallback
 *  - LLM 显式传 data 时也尊重,以 LLM 为准
 *
 * [Sprint 5.7] 重构为 class-based StructuredTool,修复 tool() 函数
 *   返回对象时被序列化为 [object Object] 的问题。
 *   sessionId 已存在于 GenerateInsightArgsSchema,由 PlannerAgent 注入。
 */
export class GenerateInsightTool extends StructuredTool {
  name = "generate_insight";

  description =
    "从一组数据(通常是 query_details 或 gen_chart 的返回)中抽取商业洞察(trend/anomaly/opportunity/risk)。**当用户问'为什么'、'原因'、'有什么问题'、'机会'、'分析一下'、'总结一下'、'给我洞察'、'风险'、'增长点'时,在拿到数据后必须紧接着调用我**。如果调用时没传 data 参数,系统会自动从最近的 query_details / gen_chart 结果补全。";

  schema = GenerateInsightArgsSchema;

  constructor(
    private readonly insightAgent: InsightAgent,
    private readonly context: ToolResultContext,
  ) {
    super();
  }

  async _call(
    input: import("zod").infer<typeof GenerateInsightArgsSchema> & {
      // Tool 调用时由 Planner 注入 (已在 schema 中定义为 optional)
      sessionId?: string;
    },
  ): Promise<string> {
    try {
      let data = input.data;

      // 兜底:data 缺失 / 是空对象 / 是字符串占位符 时从 context 取
      const needsFallback =
        data == null ||
        (typeof data === "object" && Object.keys(data).length === 0) ||
        data === "null" ||
        data === "undefined";

      if (needsFallback && input.sessionId) {
        const latest = this.context.getLatestData(input.sessionId);
        if (latest) {
          // [Sprint 5.7+] 提取实际数据: gen_chart 有 rows + metrics, query_details 有 rows
          const payload = latest.result as Record<string, unknown>;
          data = {
            source: latest.name,
            rows: payload.rows ?? payload,
            metrics: payload.metrics ?? [],
            metricLabels: payload.metricLabels ?? {},
          };
        } else {
          return JSON.stringify({
            error:
              "没有可分析的数据。请先调用 query_details 或 gen_chart 拿到数据,再让我分析。",
          });
        }
      }

      const result = await this.insightAgent.generate({
        question: input.question,
        data,
        focus: input.focus ?? null,
      });
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
