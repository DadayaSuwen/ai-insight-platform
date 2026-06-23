import type { Message } from '@workspace/types';
import type { SSEChartData, SSESQLData } from '@workspace/types';

/**
 * Assistant message augmented with SSE payload data.
 * User messages are plain `Message`.
 */
export interface AssistantMessage extends Message {
  role: 'assistant';
  /** SQL payload (from SSE sql event) */
  sql?: SSESQLData;
  /** Chart payload (from SSE chart event) */
  chart?: SSEChartData;
  /** Analysis content (from SSE analysis event) */
  analysis?: string;
  /** Error code/message (from SSE error event) */
  error?: { code?: string; message: string };
  /** True after the SSE 'done' event was received */
  isFinal: boolean;
  /** Tool calls sequence (from SSE tool_call events) */
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  /** Tool results sequence (from SSE tool_result events) */
  toolResults?: Array<{ name: string; result: Record<string, unknown> }>;
}

export type ChatMessage = Message | AssistantMessage;

export function isAssistant(msg: ChatMessage): msg is AssistantMessage {
  return msg.role === 'assistant';
}
