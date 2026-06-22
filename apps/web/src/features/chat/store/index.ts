import { create } from 'zustand';
import type { ChatMessage } from '../types';

interface ChatState {
  messages: ChatMessage[];
  /** Append a fully-formed message (user or finalized assistant) */
  addMessage: (message: ChatMessage) => void;
  /** Update the last assistant message in place (used during streaming) */
  updateLastAssistant: (updater: (msg: import('../types').AssistantMessage) => import('../types').AssistantMessage) => void;
  clearMessages: () => void;
}

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
}));
