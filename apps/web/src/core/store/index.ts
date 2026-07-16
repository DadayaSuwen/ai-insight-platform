import { create } from "zustand";
import { LLMProvider, type LLMConfig } from "@workspace/types";
import axiosInstance from "../api/AxiosInstance";

interface AppState {
  llmConfigs: Record<LLMProvider, LLMConfig | null>;
  activeProvider: LLMProvider;
  llmHealth: { openai: boolean; anthropic: boolean } | null;
  isLoadingConfig: boolean;

  fetchLlmConfig: () => Promise<void>;
  saveLlmConfig: (config: LLMConfig) => Promise<{ ok: boolean; message: string }>;
  activateProvider: (provider: LLMProvider) => Promise<{ ok: boolean; message?: string }>;
  fetchLlmHealth: () => Promise<void>;
}

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
      const res = await axiosInstance.get("/llm/config");
      const data = res.data;
      const llmConfigs = { ...defaultConfigs } as Record<LLMProvider, LLMConfig | null>;
      for (const cfg of (data.configs || [])) {
        // 后端返回 apiKeyMasked/hasApiKey 而非明文 apiKey
        llmConfigs[cfg.provider as LLMProvider] = {
          provider: cfg.provider,
          model: cfg.model,
          temperature: cfg.temperature,
          baseUrl: cfg.baseUrl,
          apiKey: cfg.hasApiKey ? (cfg.apiKeyMasked || "****") : "",
        } as LLMConfig;
      }
      set({ llmConfigs, activeProvider: data.activeProvider as LLMProvider, isLoadingConfig: false });
    } catch {
      set({ isLoadingConfig: false });
    }
  },

  saveLlmConfig: async (config: LLMConfig) => {
    const payload: Record<string, unknown> = {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
    };
    if (config.baseUrl) payload.baseUrl = config.baseUrl;
    if (config.apiKey !== undefined) {
      payload.apiKey = config.apiKey;
    }

    try {
      const res = await axiosInstance.post("/llm/config", payload);
      const data = res.data;
      if (data.ok) {
        // 保存配置不切换活跃 — 活跃状态由 activateProvider 单独控制
        set((state) => ({
          llmConfigs: { ...state.llmConfigs, [config.provider]: config },
        }));
      }
      return { ok: !!data.ok, message: data.message ?? "" };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || `网络错误：${(e as Error).message}` };
    }
  },

  /**
   * [Fix] 显式切换活跃 Provider — 与保存配置解耦。
   * 调用后端 /llm/config (不传 model 等也会保留),然后拉一次最新 activeProvider。
   */
  activateProvider: async (provider: LLMProvider) => {
    try {
      const res = await axiosInstance.post<{ success: boolean; data: { activeProvider: LLMProvider } }>(
        "/llm/config/active",
        { provider },
      );
      const active = res.data?.data?.activeProvider ?? provider;
      set({ activeProvider: active });
      // 重新拉一次完整配置同步 UI
      const cur = useAppStore.getState();
      await cur.fetchLlmConfig();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || `网络错误：${(e as Error).message}` };
    }
  },

  fetchLlmHealth: async () => {
    try {
      const res = await axiosInstance.get("/llm/health");
      const data = res.data;
      set({
        llmHealth: {
          openai: data.openai?.ok ?? false,
          anthropic: data.anthropic?.ok ?? false,
        },
      });
    } catch {
      // ignore
    }
  },
}));
