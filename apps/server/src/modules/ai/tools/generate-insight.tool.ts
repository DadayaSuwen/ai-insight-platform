import { tool } from "@langchain/core/tools";
import { GenerateInsightArgsSchema } from "./schemas";
import { InsightAgent } from "../agents/insight.agent";
import { ToolResultContext } from "./tool-result.context";

/**
 * generate_insight 工具工厂
 *
 * Agent-as-a-Tool 模式:
 *  - 上层 Planner 看到的是 StructuredTool 接口
 *  - 内部实例化 InsightAgent,调用其 generate() 做二次 LLM pass
 *
 * 上下文兜底(架构师审查 Pitfall #2):
 *  - LLM 可能不会把上一步完整数据塞进 `data` 参数
 *  - 这里从 ToolResultContext 拿最近一条数据类工具的结果作 fallback
 *  - LLM 显式传 data 时也尊重,以 LLM 为准
 */
export function createGenerateInsightTool(
  insightAgent: InsightAgent,
  context: ToolResultContext,
) {
  return tool(
    async (
      input: import("zod").infer<typeof GenerateInsightArgsSchema> & {
        // Tool 调用时由 Planner 注入 (不来自 LLM 的 args)
        sessionId?: string;
      },
    ) => {
      try {
        let data = input.data;

        // 兜底:data 缺失 / 是空对象 / 是字符串占位符 时从 context 取
        const needsFallback =
          data == null ||
          (typeof data === "object" && Object.keys(data).length === 0) ||
          data === "null" ||
          data === "undefined";

        if (needsFallback && input.sessionId) {
          const latest = context.getLatestData(input.sessionId);
          if (latest) {
            data = {
              source: latest.name,
              payload: latest.result,
            };
            // 不静默 fallback,标记来源让前端能看到
          } else {
            return {
              error: "没有可分析的数据。请先调用 query_sales 或 query_details 拿到数据,再让我分析。",
            };
          }
        }

        const result = await insightAgent.generate({
          question: input.question,
          data,
          focus: input.focus ?? null,
        });
        return result;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      name: "generate_insight",
      description:
        "从一组数据(通常是 query_sales 或 query_details 的返回)中抽取商业洞察(trend/anomaly/opportunity/risk)。**当用户问'为什么'、'原因'、'有什么问题'、'机会'、'分析一下'、'总结一下'、'给我洞察'、'风险'、'增长点'时,在拿到数据后必须紧接着调用我**。如果调用时没传 data 参数,系统会自动从最近的 query_sales / query_details 结果补全。",
      schema: GenerateInsightArgsSchema,
    },
  );
}