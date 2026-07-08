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
    // Build payload — omit `apiKey` if empty so we don't silently overwrite
    // a previously-saved key with `null`. Empty string means "explicit clear".
    const payload: Record<string, unknown> = {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
    };
    if (config.baseUrl) payload.baseUrl = config.baseUrl;
    if (config.apiKey !== undefined) {
      // Empty string → clear; non-empty → update; undefined → omit entirely.
      payload.apiKey = config.apiKey;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/llm/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return {
        ok: false,
        message: `网络错误：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    let data: { ok?: boolean; message?: string };
    try {
      data = await res.json();
    } catch {
      return { ok: false, message: `服务器返回了非 JSON (HTTP ${res.status})` };
    }

    if (!res.ok && !data?.ok) {
      return {
        ok: false,
        message: data?.message ?? `HTTP ${res.status} ${res.statusText}`,
      };
    }

    if (data.ok) {
      set((state) => ({
        llmConfigs: { ...state.llmConfigs, [config.provider]: config },
        activeProvider: config.provider,
      }));
    }
    return { ok: !!data.ok, message: data.message ?? "" };
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
