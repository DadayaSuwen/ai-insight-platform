import type { Message } from "@workspace/types";
// SSEChartData / SSESQLData 自 ChartAgent 升级 (M1) 起已标记 @deprecated。
// 前端不再读 AssistantMessage.{sql,chart,analysis},所有图表数据走 toolResults[i].result.chart。
// 保留 import 是为了 AssistantMessage 的兼容字段类型 (M5 彻底删除)。
import type { SSEChartData, SSESQLData } from "@workspace/types";

/**
 * 工具调用数据 — 来自后端 planner yield 的 `tool_call` 事件。
 * 与 `apps/server/src/modules/ai/agents/planner.agent.ts` 的 PlannerToolCallData 对齐。
 * `id` 是跨 turn 全局唯一的工具调用 id：后端在保存时统一洗成 UUID。
 */
export interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** 工具结果数据 — 来自 `tool_result` 事件。 */
export interface ToolResultData {
  id: string;
  name: string;
  /**
   * 与 `@workspace/types` 的 `SSEToolResultData.result` 兼容:
   * - `chart` 字段已升级为 `EChartsOption` (M1 引入)
   * - `chartType` / `chartSource` / `metrics` / `metricLabels` / `groupBy` 是 M1 新增
   */
  result: Record<string, unknown>;
}

/** SSE 事件 data 形态（fetch API 解析后） */
export interface TextEventData {
  content: string;
}

export interface ErrorEventData {
  code: string;
  message: string;
  /** [M7] 后端 traceId (chat.service.ts SSE error event 注入),客服可凭此查服务端日志 */
  traceId?: string;
}

/** done 事件可携带 session 字段，用于前端刷新侧栏 */
export interface DoneEventData {
  session?: { id: string; title: string; createdAt: string; updatedAt: string } | null;
}

/**
 * Assistant message — SSE 流式累积的最终形态，落到 store 渲染。
 *
 * 重复定义的历史：旧 types.ts 里有 2 个 AssistantMessage（一带 sql/chart/analysis
 * 字段，一带 toolCalls/toolResults 字段），现在合并为权威版本。
 *
 * 适配新的 Agent 架构：
 *   - 流式 Markdown 文本 → content
 *   - 工具调用状态时间线 → toolCalls
 *   - 工具返回的图表/表格 → toolResults（render 由 MessageBubble 决定）
 */
export interface AssistantMessage extends Message {
  id: string;
  role: "assistant";
  content: string;
  createdAt: string;
  /** True after the SSE 'done' event was received */
  isFinal: boolean;
  /** Tool calls sequence (from SSE tool_call events) */
  toolCalls?: ToolCallData[];
  /** Tool results sequence (from SSE tool_result events) */
  toolResults?: ToolResultData[];
  /** Error code/message (from SSE error event) */
  error?: { code?: string; message: string };
  /** LLM thinking content (from SSE thinking event) — reserved, planner 暂未用 */
  thinking?: string;
  /**
   * 兼容旧版 SSE 事件的字段（已废弃，保留以防组件仍有引用）
   * @deprecated 自 ChartAgent 升级 (M1) 起,所有图表/SQL/分析数据应通过 toolResults 读取。
   *             M5 阶段 grep 确认无消费后将彻底删除。
   */
  sql?: SSESQLData;
  /** @deprecated 同 AssistantMessage.sql */
  chart?: SSEChartData;
  /** @deprecated 同 AssistantMessage.sql */
  analysis?: string;
}

export type ChatMessage = Message | AssistantMessage;

export function isAssistant(msg: ChatMessage): msg is AssistantMessage {
  return msg.role === "assistant";
}
