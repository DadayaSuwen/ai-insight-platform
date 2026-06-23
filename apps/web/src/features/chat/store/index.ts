import { create } from 'zustand';
import type { ChatMessage } from '../types';

interface ChatState {
  messages: ChatMessage[];
  /** Append a fully-formed message (user or finalized assistant) */
  addMessage: (message: ChatMessage) => void;
  /** Update the last assistant message in place (used during streaming) */
  updateLastAssistant: (updater: (msg: import('../types').AssistantMessage) => import('../types').AssistantMessage) => void;
  clearMessages: () => void;
  /** Dark mode */
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const getInitialTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useChatStore = create<ChatState>((set) => ({
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
      const last = state.messages[realIdx] as import('../types').AssistantMessage;
      return {
        messages: [
          ...state.messages.slice(0, realIdx),
          updater(last),
          ...state.messages.slice(realIdx + 1),
        ],
      };
    }),
  clearMessages: () => set({ messages: [] }),

  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),
}));
