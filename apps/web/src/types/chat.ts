import type { ToolCallData, ToolResultData } from "../features/chat/types";

/** Mirrors the row returned by GET/POST /chat/sessions */
export interface ChatSession {
  id: string;
  title: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Mirrors the row returned by GET /chat/sessions/:id/messages */
export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  /**
   * ChatMessage.metadata 是 Postgres JSONB 列。
   * Kysely + pg 驱动读出时自动 JSON.parse 为对象；
   * 极少数情况（老脏数据 / driver 异常）可能是 string。
   * 消费方必须 typeof 判断，详见 recordToChatMessage.ts。
   */
  metadata: string | Record<string, unknown> | null;
  createdAt: string;
}

export interface MessageMetadata {
  toolCalls?: ToolCallData[];
  toolResults?: ToolResultData[];
}

export interface CreateSessionResponse {
  success: true;
  data: ChatSession;
}

export interface DeleteSessionResponse {
  success: true;
  data: { id: string };
}

export interface RenameSessionResponse {
  success: true;
  data: { id: string; title: string };
}
