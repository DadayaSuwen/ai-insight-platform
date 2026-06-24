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
  /** JSON.stringify({ toolCalls, toolResults }) or null */
  metadata: string | null;
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
