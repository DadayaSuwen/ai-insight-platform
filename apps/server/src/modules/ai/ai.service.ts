import { Injectable, Logger } from "@nestjs/common";
import type { BaseMessage } from "@langchain/core/messages";
import { PlannerAgent, type PlannerStreamEvent } from "./agents/planner.agent";

/**
 * AiService — Pipeline Orchestrator (delegates to PlannerAgent)
 * 在 Agent 架构下，它的唯一职责是透传流式事件和捕获全局异常。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly plannerAgent: PlannerAgent) {}

  /**
   * 流式处理用户请求，直接透传 PlannerAgent 产生的所有事件。
   */
  async *processStream(
    message: string,
    historyMessages: BaseMessage[] = [],
    opts: { signal?: AbortSignal } = {},
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    this.logger.log(`[stream] Processing message: ${message}`);

    try {
      await this.plannerAgent.refreshSchema();
      // 将历史记录传给 PlannerAgent
      yield* this.plannerAgent.invokeStream(message, historyMessages, opts);
    } catch (error: unknown) {
      // 捕获未预期的同步/异步错误，防止 SSE 流静默中断
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[stream] PlannerAgent failed: ${msg}`);
      yield {
        type: "error",
        data: { code: "PLANNER_FAILED", message: msg },
      };
      yield { type: "done", data: {} };
    }
  }
}
