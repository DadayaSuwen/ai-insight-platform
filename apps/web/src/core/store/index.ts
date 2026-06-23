import { create } from 'zustand';
import { LLMProvider, type LLMConfig } from '@workspace/types';

interface AppState {
  llmConfig: LLMConfig | null;
  llmHealth: {
    openai: boolean;
    anthropic: boolean;
    ollama: boolean;
  } | null;
  isLoadingConfig: boolean;

  fetchLlmConfig: () => Promise<void>;
  saveLlmConfig: (config: LLMConfig) => Promise<{ ok: boolean; message: string }>;
  fetchLlmHealth: () => Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const useAppStore = create<AppState>((set) => ({
  llmConfig: null,
  llmHealth: null,
  isLoadingConfig: false,

  fetchLlmConfig: async () => {
    set({ isLoadingConfig: true });
    try {
      const res = await fetch(`${API_BASE}/llm/config`);
      if (res.ok) {
        const data = await res.json();
        set({ llmConfig: data, isLoadingConfig: false });
      } else {
        set({ isLoadingConfig: false });
      }
    } catch {
      set({ isLoadingConfig: false });
    }
  },

  saveLlmConfig: async (config: LLMConfig) => {
    const res = await fetch(`${API_BASE}/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (data.ok) {
      set({ llmConfig: config });
    }
    return data;
  },

  fetchLlmHealth: async () => {
    try {
      const res = await fetch(`${API_BASE}/llm/health`);
      if (res.ok) {
        const data = await res.json();
        set({
          llmHealth: {
            openai: data.openai?.ok ?? false,
            anthropic: data.anthropic?.ok ?? false,
            ollama: data.ollama?.ok ?? false,
          },
        });
      }
    } catch {
      // ignore
    }
  },
}));
