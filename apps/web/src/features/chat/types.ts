import type { Message } from "@workspace/types";
import type { SSEChartData, SSESQLData } from "@workspace/types";

/**
 * 工具调用数据 — 来自后端 planner yield 的 `tool_call` 事件。
 * 与 `apps/server/src/modules/ai/agents/planner.agent.ts` 的 PlannerToolCallData 对齐。
 * `id` 是跨 turn 全局唯一的工具调用 id：
 *   - OpenAI / Anthropic 走真 UUID
 *   - Ollama 复用函数名 → planner 层洗成 UUID（见 planner.agent.ts 注释）
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
  result: Record<string, unknown>;
}

/** SSE 事件 data 形态（fetch API 解析后） */
export interface TextEventData {
  content: string;
}

export interface ErrorEventData {
  code: string;
  message: string;
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
  /** 兼容旧版 SSE 事件的字段（已废弃，保留以防组件仍有引用） */
  sql?: SSESQLData;
  chart?: SSEChartData;
  analysis?: string;
}

export type ChatMessage = Message | AssistantMessage;

export function isAssistant(msg: ChatMessage): msg is AssistantMessage {
  return msg.role === "assistant";
}
