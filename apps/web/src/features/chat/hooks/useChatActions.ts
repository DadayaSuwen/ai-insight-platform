import { useCallback } from "react";
import { useChatStore } from "../store";
import { chatSessionApi } from "../api";
import { recordToChatMessage } from "../utils/recordToChatMessage";
import { toast } from "../../../store/toast";
import type { AssistantMessage, ChatMessage } from "../types";

interface SendInCurrentSessionOptions {
  sendMessage: (text: string, sessionId: string) => void;
  abort?: () => void;
  newId: () => string;
}

/**
 * Centralized side-effect glue for chat session lifecycle. Keeps ChatWindow
 * lean and lets sidebar components stay dumb.
 */
export function useChatActions() {
  const {
    setSessions,
    upsertSession,
    removeSessionLocal,
    setMessages,
    setCurrentSessionId,
    setSessionsLoading,
    setHistoryLoading,
    setSidebarOpen,
  } = useChatStore.getState();

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const list = await chatSessionApi.list();
      setSessions(list);
      // Drop persisted current if the server says it's gone.
      const cur = useChatStore.getState().currentSessionId;
      if (cur && !list.some((s) => s.id === cur)) {
        setCurrentSessionId(null);
      }
    } catch (err) {
      console.error("[useChatActions] loadSessions failed", err);
    } finally {
      setSessionsLoading(false);
    }
  }, [
    setSessions,
    setSessionsLoading,
    setCurrentSessionId,
  ]);

  const selectSession = useCallback(
    async (id: string, opts: { abort?: () => void }) => {
      // Abort any in-flight stream first.
      opts.abort?.();
      setHistoryLoading(true);
      try {
        const records = await chatSessionApi.messages(id);
        const msgs: ChatMessage[] = records.map(recordToChatMessage);
        setMessages(msgs);
        setCurrentSessionId(id);
      } catch (err) {
        console.error("[useChatActions] selectSession failed", err);
      } finally {
        setHistoryLoading(false);
      }
    },
    [setMessages, setCurrentSessionId, setHistoryLoading],
  );

  const handleNewChat = useCallback(async () => {
    try {
      const created = await chatSessionApi.create("新对话");
      upsertSession(created);
      setCurrentSessionId(created.id);
      setMessages([]);
    } catch (err) {
      console.error("[useChatActions] handleNewChat failed", err);
      toast.error("新建会话失败");
    }
  }, [upsertSession, setCurrentSessionId, setMessages]);

  const handleDelete = useCallback(
    async (id: string) => {
      const state = useChatStore.getState();
      const removed = state.sessions.find((s) => s.id === id);
      // Optimistic local removal
      removeSessionLocal(id);
      const wasCurrent = state.currentSessionId === id;
      if (wasCurrent) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      try {
        await chatSessionApi.remove(id);
        toast.success("会话已删除");
      } catch (err) {
        console.error("[useChatActions] handleDelete failed, rolling back", err);
        if (removed) upsertSession(removed);
        if (wasCurrent) {
          setCurrentSessionId(id);
        }
        toast.error("删除失败，已恢复");
      }
    },
    [removeSessionLocal, setCurrentSessionId, setMessages, upsertSession],
  );

  /**
   * 重命名会话：乐观更新 + 失败回滚 + Toast。
   * 返回 true 表示成功，false 表示失败或空标题（被忽略）。
   */
  const handleRename = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      const trimmed = title.trim();
      if (!trimmed) return false;
      const before = useChatStore.getState().sessions.find((s) => s.id === id);
      if (!before) return false;
      // 乐观更新
      upsertSession({ ...before, title: trimmed });
      try {
        await chatSessionApi.rename(id, trimmed);
        return true;
      } catch (err) {
        console.error("[useChatActions] rename failed, rolling back", err);
        upsertSession(before);
        toast.error("重命名失败");
        return false;
      }
    },
    [upsertSession],
  );

  const sendInCurrentSession = useCallback(
    async (text: string, opts: SendInCurrentSessionOptions) => {
      let sessionId = useChatStore.getState().currentSessionId;
      if (!sessionId) {
        try {
          const created = await chatSessionApi.create("新对话");
          upsertSession(created);
          setCurrentSessionId(created.id);
          sessionId = created.id;
        } catch (err) {
          console.error("[useChatActions] create session failed", err);
          return;
        }
      }
      const userMsg: ChatMessage = {
        id: opts.newId(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      } as ChatMessage;
      const draftAssistant: AssistantMessage = {
        id: opts.newId(),
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        isFinal: false,
        toolCalls: [],
        toolResults: [],
      };
      useChatStore.getState().addMessage(userMsg);
      useChatStore.getState().addMessage(draftAssistant);
      opts.sendMessage(text, sessionId);
    },
    [upsertSession, setCurrentSessionId],
  );

  const refreshSessions = useCallback(async () => {
    try {
      const list = await chatSessionApi.list();
      setSessions(list);
    } catch (err) {
      console.error("[useChatActions] refreshSessions failed", err);
    }
  }, [setSessions]);

  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  return {
    loadSessions,
    selectSession,
    handleNewChat,
    handleDelete,
    handleRename,
    sendInCurrentSession,
    refreshSessions,
    closeMobileSidebar,
  };
}
