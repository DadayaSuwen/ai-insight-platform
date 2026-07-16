import { axiosInstance } from "../../core/api";
import type {
  ChatSession,
  ChatMessageRecord,
  CreateSessionResponse,
  DeleteSessionResponse,
  RenameSessionResponse,
} from "../../types/chat";

/** Thin Axios-based client for chat session CRUD. SSE remains on native fetch. */
export const chatSessionApi = {
  list: () =>
    axiosInstance
      .get<{ success: boolean; data: ChatSession[] }>("/chat/sessions")
      .then((r) => r.data.data),

  create: (title: string = "新对话", dataSourceId?: string) =>
    axiosInstance
      .post<CreateSessionResponse>("/chat/sessions", { title, dataSourceId })
      .then((r) => r.data.data),

  messages: (id: string) =>
    axiosInstance
      .get<{ success: boolean; data: ChatMessageRecord[] }>(
        `/chat/sessions/${id}/messages`,
      )
      .then((r) => r.data.data),

  remove: (id: string) =>
    axiosInstance
      .delete<DeleteSessionResponse>(`/chat/sessions/${id}`)
      .then((r) => r.data),

  rename: (id: string, title: string) =>
    axiosInstance
      .put<RenameSessionResponse>(`/chat/sessions/${id}`, { title })
      .then((r) => r.data),
};
