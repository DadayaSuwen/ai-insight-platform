import { create } from 'zustand';
import type { ChatMessage, AssistantMessage } from '../types';
import type { ChatSession } from '../../../types/chat';
import {
  loadSessions,
  loadCurrentSessionId,
  loadSidebarOpen,
  loadSidebarCollapsed,
  pruneMissingSessionId,
} from './persistence';

interface ChatState {
  // ── 既有：消息与主题 ──
  messages: ChatMessage[];
  /** Append a fully-formed message (user or finalized assistant) */
  addMessage: (message: ChatMessage) => void;
  /** Update the last assistant message in place (used during streaming) */
  updateLastAssistant: (
    updater: (msg: AssistantMessage) => AssistantMessage,
  ) => void;
  /** Replace the entire messages array (used on session switch) */
  setMessages: (msgs: ChatMessage[]) => void;
  clearMessages: () => void;
  /** Dark mode */
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // ── 新增：会话管理 ──
  currentSessionId: string | null;
  sessions: ChatSession[];
  sessionsLoading: boolean;
  historyLoading: boolean;
  sidebarOpen: boolean;
  /** Desktop only: whether the sidebar is in its narrow (icon-strip) form. */
  sidebarCollapsed: boolean;

  setCurrentSessionId: (id: string | null) => void;
  setSessions: (s: ChatSession[]) => void;
  /** Insert or update a session in the list (matched by id). */
  upsertSession: (s: ChatSession) => void;
  /** Optimistic local removal. The caller is responsible for the API call + rollback. */
  removeSessionLocal: (id: string) => void;
  setSessionsLoading: (b: boolean) => void;
  setHistoryLoading: (b: boolean) => void;
  setSidebarOpen: (b: boolean) => void;
  setSidebarCollapsed: (b: boolean) => void;
}

const getInitialTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const initialSessions = loadSessions();
const initialCurrent = pruneMissingSessionId(
  loadCurrentSessionId(),
  initialSessions,
);
const initialSidebar = loadSidebarOpen();
const initialSidebarCollapsed = loadSidebarCollapsed();

export const useChatStore = create<ChatState>((set) => ({
  // ── messages / theme ──
  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateLastAssistant: (updater) =>
    set((state) => {
      const idx = [...state.messages]
        .reverse()
        .findIndex((m) => m.role === 'assistant');
      if (idx === -1) return state;
      const realIdx = state.messages.length - 1 - idx;
      const last = state.messages[realIdx] as AssistantMessage;
      return {
        messages: [
          ...state.messages.slice(0, realIdx),
          updater(last),
          ...state.messages.slice(realIdx + 1),
        ],
      };
    }),
  setMessages: (msgs) => set({ messages: msgs }),
  clearMessages: () => set({ messages: [] }),

  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),

  // ── session management ──
  currentSessionId: initialCurrent,
  sessions: initialSessions,
  sessionsLoading: false,
  historyLoading: false,
  sidebarOpen: initialSidebar,
  sidebarCollapsed: initialSidebarCollapsed,

  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setSessions: (s) => set({ sessions: s }),
  upsertSession: (s) =>
    set((state) => {
      const idx = state.sessions.findIndex((x) => x.id === s.id);
      if (idx === -1) {
        // newest first
        return { sessions: [s, ...state.sessions] };
      }
      const next = [...state.sessions];
      next[idx] = s;
      return { sessions: next };
    }),
  removeSessionLocal: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    })),
  setSessionsLoading: (b) => set({ sessionsLoading: b }),
  setHistoryLoading: (b) => set({ historyLoading: b }),
  setSidebarOpen: (b) => set({ sidebarOpen: b }),
  setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),
}));
