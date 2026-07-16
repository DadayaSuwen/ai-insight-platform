import { Injectable } from "@nestjs/common";
import type { UsageMetadata } from "@langchain/core/messages";

/**
 * LlmStatsCollector — 聚合单轮对话中所有 LLM 调用的真实 token 消耗。
 *
 * 为什么需要:
 *  PlannerAgent 是 ReAct 循环 — 每轮可能调 1+ 次 LLM (主循环 + 子 agent)。
 *  chat-system-architecture.md §六原则 4 要求"每轮对话必须透明展示资源消耗"。
 *  Token 数字必须从 LangChain AIMessageChunk.usage_metadata 聚合得出,不能用
 *  客户端字符数 × 0.75 估算(精度差 + 多个子 agent 调用会漏算)。
 *
 * 设计 (参考 tool-result.context.ts 风格):
 *  - 单例 in-memory 累加器,作用域 = 单轮 SSE 流。
 *  - recordUsage() 累加 UsageMetadata(input/output/total tokens)
 *    不区分 chunk 来源(主循环 / InsightAgent / ChartAgent 内部调用)。
 *  - peek() 不清零,允许 PlannerAgent 在内部 yield done 时读最新快照
 *    (ChatService 在最外层统一 consumeAndReset,保证跨 ReAct 迭代聚合正确)。
 *  - consumeAndReset() 取并清零 — 必须在 ChatService 的最终 done yield 前调用,
 *    避免下一轮对话带脏数据。
 *
 *  Anthropic 流式 API 不发送 usage_metadata,recordUsage 收到 undefined 时静默忽略,
 *  这种情况 ChatService 端 stats.totalTokens 等字段为 undefined,前端兜底显示 —。
 */
@Injectable()
export class LlmStatsCollector {
  private total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  /**
   * 累加一次 LLM 调用的 usage_metadata。LangChain AIMessageChunk.concat() 后,
   * 最后一个 chunk 的 usage_metadata 通常包含整轮聚合数字,直接传入即可。
   *
   * @param usage 来自 AIMessageChunk.usage_metadata,字段缺失时静默忽略
   */
  recordUsage(usage: UsageMetadata | undefined | null): void {
    if (!usage) return;
    // LangChain UsageMetadata 字段名是 input_tokens / output_tokens / total_tokens (snake_case)
    if (typeof usage.input_tokens === "number") {
      this.total.inputTokens += usage.input_tokens;
    }
    if (typeof usage.output_tokens === "number") {
      this.total.outputTokens += usage.output_tokens;
    }
    if (typeof usage.total_tokens === "number") {
      this.total.totalTokens += usage.total_tokens;
    } else {
      // 没 total_tokens 时由 input + output 推算(LangChain 部分 provider 不发)
      this.total.totalTokens = this.total.inputTokens + this.total.outputTokens;
    }
  }

  /**
   * 读取当前聚合快照,**不清零**。用于 PlannerAgent 在中间 yield done 时上报。
   * 注意:返回的是浅拷贝,外部修改不影响内部状态。
   */
  peek(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    return { ...this.total };
  }

  /**
   * 取出当前聚合并清零。ChatService 在最终 done yield 前调用一次,
   * 既拿到完整数字又避免污染下一轮对话。
   */
  consumeAndReset(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    const snap = { ...this.total };
    this.total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    return snap;
  }

  /** 调试用 — 当前是否还有未消费的 token 计数 */
  hasPending(): boolean {
    return (
      this.total.inputTokens > 0 ||
      this.total.outputTokens > 0 ||
      this.total.totalTokens > 0
    );
  }
}