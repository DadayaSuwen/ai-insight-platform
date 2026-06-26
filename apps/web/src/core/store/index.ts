import { create } from "zustand";
import { LLMProvider, type LLMConfig } from "@workspace/types";

interface AppState {
  /** All provider configs keyed by provider name */
  llmConfigs: Record<LLMProvider, LLMConfig | null>;
  /** Currently active provider (set after POST /llm/config or on load) */
  activeProvider: LLMProvider;
  llmHealth: {
    openai: boolean;
    anthropic: boolean;
  } | null;
  isLoadingConfig: boolean;

  fetchLlmConfig: () => Promise<void>;
  saveLlmConfig: (
    config: LLMConfig,
  ) => Promise<{ ok: boolean; message: string }>;
  fetchLlmHealth: () => Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const defaultConfigs: Record<LLMProvider, LLMConfig | null> = {
  [LLMProvider.OPENAI]: null,
  [LLMProvider.ANTHROPIC]: null,
};

export const useAppStore = create<AppState>((set) => ({
  llmConfigs: { ...defaultConfigs },
  activeProvider: LLMProvider.OPENAI,
  llmHealth: null,
  isLoadingConfig: false,

  fetchLlmConfig: async () => {
    set({ isLoadingConfig: true });
    try {
      const res = await fetch(`${API_BASE}/llm/config`);
      if (res.ok) {
        const data: { configs: LLMConfig[]; activeProvider: string } =
          await res.json();
        const llmConfigs = { ...defaultConfigs } as Record<
          LLMProvider,
          LLMConfig | null
        >;
        for (const cfg of data.configs) {
          llmConfigs[cfg.provider] = cfg;
        }
        set({
          llmConfigs,
          activeProvider: data.activeProvider as LLMProvider,
          isLoadingConfig: false,
        });
      } else {
        set({ isLoadingConfig: false });
      }
    } catch {
      set({ isLoadingConfig: false });
    }
  },

  saveLlmConfig: async (config: LLMConfig) => {
    const res = await fetch(`${API_BASE}/llm/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (data.ok) {
      set((state) => ({
        llmConfigs: { ...state.llmConfigs, [config.provider]: config },
        activeProvider: config.provider,
      }));
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
          },
        });
      }
    } catch {
      // ignore
    }
  },
}));
