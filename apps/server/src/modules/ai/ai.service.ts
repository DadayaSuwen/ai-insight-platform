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
   *
   * [Sprint 2] opts.dataSourceId 决定 PlannerAgent.buildSystemPrompt() 从哪个
   * DataSource 拉 MetadataSnapshot。
   */
  async *processStream(
    message: string,
    historyMessages: BaseMessage[] = [],
    opts: {
      signal?: AbortSignal;
      sessionId?: string;
      dataSourceId?: string;
      currentUserId?: string; // [Sprint 5]
    } = {},
  ): AsyncGenerator<PlannerStreamEvent, void, unknown> {
    this.logger.log(`[stream] Processing message: ${message}`);

    try {
      // [Sprint 2] 不再调原 refreshSchema 兼容老调用 (读整库 information_schema,慢且与多数据源无关),
      // 改为 PlannerAgent.buildSystemPrompt(dataSourceId) 按需读 MetadataCache。
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
