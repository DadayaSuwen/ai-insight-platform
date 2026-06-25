import type { ChatMessage, AssistantMessage } from "../types";
import type {
  ChatMessageRecord,
  MessageMetadata,
} from "../../../types/chat";

/**
 * Convert a wire-format ChatMessageRecord (from the backend) into the
 * in-store ChatMessage shape so MessageBubble can render tool calls/results
 * identically to a streamed message.
 *
 * 形态分支说明：
 *  - 写入端已统一传 JS 对象（见 chat-session.service.ts saveMessage 注释），
 *    Kysely + pg 驱动读 JSONB 时自动 parse 为对象 → r.metadata 是 object。
 *  - 老脏数据（之前的版本应用层手写 JSON.stringify）落入 JSONB 后顶层是
 *    字符串，pg 驱动不会自动 unwrap，于是 r.metadata 仍然是 string。
 *  - 极少数情况（driver 异常 / 直接传 null）走最后兜底。
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

  // 三段式安全解析：string → parse，object → 直接用，其他 → {}
  let meta: unknown = r.metadata;
  if (typeof meta === "string") {
    const raw = meta;
    try {
      meta = JSON.parse(raw);
    } catch (err) {
      // 之前 catch 块静默吞错，回归时极难定位；改为 console.warn
      console.warn(
        "[recordToChatMessage] metadata string failed to parse:",
        err,
        raw.slice(0, 200),
      );
      meta = {};
    }
  }
  if (!meta || typeof meta !== "object") {
    meta = {};
  }
  const m = meta as MessageMetadata;

  return {
    id: r.id,
    role: "assistant",
    content: r.content,
    createdAt: r.createdAt,
    isFinal: true,
    toolCalls: m.toolCalls ?? [],
    toolResults: m.toolResults ?? [],
  } as AssistantMessage;
}
