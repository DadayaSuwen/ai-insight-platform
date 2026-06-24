import type { ChatMessage, AssistantMessage } from "../types";
import type {
  ChatMessageRecord,
  MessageMetadata,
} from "../../../types/chat";

/**
 * Convert a wire-format ChatMessageRecord (from the backend) into the
 * in-store ChatMessage shape so MessageBubble can render tool calls/results
 * identically to a streamed message.
 */
export function recordToChatMessage(r: ChatMessageRecord): ChatMessage {
  if (r.role === "user") {
    return {
      id: r.id,
      role: "user",
      content: r.content,
      createdAt: r.createdAt,
    } as ChatMessage;
  }
  let meta: MessageMetadata = {};
  if (r.metadata) {
    try {
      meta = JSON.parse(r.metadata) as MessageMetadata;
    } catch {
      meta = {};
    }
  }
  return {
    id: r.id,
    role: "assistant",
    content: r.content,
    createdAt: r.createdAt,
    isFinal: true,
    toolCalls: meta.toolCalls ?? [],
    toolResults: meta.toolResults ?? [],
  } as AssistantMessage;
}
