import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../core/store';
import type { LLMConfig } from '@workspace/types';
import { LLMProvider } from '@workspace/types';

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'OpenAI',
  [LLMProvider.ANTHROPIC]: 'Anthropic',
  [LLMProvider.OLLAMA]: 'Ollama (本地)',
};

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'gpt-4o',
  [LLMProvider.ANTHROPIC]: 'claude-3-5-sonnet-20240620',
  [LLMProvider.OLLAMA]: 'qwen3:8b',
};

const BASE_URLS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'https://api.openai.com/v1',
  [LLMProvider.ANTHROPIC]: 'https://api.anthropic.com',
  [LLMProvider.OLLAMA]: 'http://localhost:11434',
};

interface FormState {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

function HealthDot({ ok }: { ok: boolean | undefined }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: ok ? 'var(--success)' : 'var(--error)' }}
    />
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { llmConfig, llmHealth, isLoadingConfig, fetchLlmConfig, saveLlmConfig, fetchLlmHealth } =
    useAppStore();

  const [form, setForm] = useState<FormState>({
    provider: LLMProvider.OLLAMA,
    apiKey: '',
    baseUrl: BASE_URLS[LLMProvider.OLLAMA],
    model: DEFAULT_MODELS[LLMProvider.OLLAMA],
    temperature: 0,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetchLlmConfig();
    fetchLlmHealth();
  }, []);

  // Populate form when config loads
  useEffect(() => {
    if (llmConfig) {
      setForm({
        provider: llmConfig.provider,
        apiKey: llmConfig.apiKey ?? '',
        baseUrl: llmConfig.baseUrl ?? BASE_URLS[llmConfig.provider],
        model: llmConfig.model,
        temperature: llmConfig.temperature,
      });
    }
  }, [llmConfig]);

  const handleProviderChange = (p: LLMProvider) => {
    setForm((f) => ({
      ...f,
      provider: p,
      baseUrl: BASE_URLS[p],
      model: DEFAULT_MODELS[p],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const config: LLMConfig = {
      provider: form.provider,
      apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl || undefined,
      model: form.model,
      temperature: form.temperature,
    };
    const result = await saveLlmConfig(config);
    setMessage({
      type: result.ok ? 'ok' : 'err',
      text: result.message,
    });
    setSaving(false);
    if (result.ok) {
      setTimeout(() => navigate('/'), 1200);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          LLM 设置
        </h1>
      </header>

      {/* Body */}
      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto p-6">
        {/* Provider selector */}
        <section className="mb-6">
          <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            提供商
          </p>
          <div className="flex gap-2">
            {([LLMProvider.OLLAMA, LLMProvider.OPENAI, LLMProvider.ANTHROPIC] as LLMProvider[]).map(
              (p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className="flex flex-col items-center gap-1 rounded-xl border px-4 py-3 text-xs transition-all"
                  style={{
                    borderColor:
                      form.provider === p ? 'var(--accent)' : 'var(--border)',
                    background: form.provider === p ? 'var(--accent-light)' : 'var(--bg-secondary)',
                    color:
                      form.provider === p ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {PROVIDER_LABELS[p]}
                  {llmHealth && (
                    <HealthDot
                      ok={
                        p === LLMProvider.OPENAI
                          ? llmHealth.openai
                          : p === LLMProvider.ANTHROPIC
                            ? llmHealth.anthropic
                            : llmHealth.ollama
                      }
                    />
                  )}
                </button>
              ),
            )}
          </div>
        </section>

        {/* API Key */}
        {form.provider !== LLMProvider.OLLAMA && (
          <section className="mb-4">
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              API Key
            </label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder={form.provider === LLMProvider.OPENAI ? 'sk-...' : 'sk-ant-...'}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </section>
        )}

        {/* Base URL */}
        {form.provider !== LLMProvider.OLLAMA && (
          <section className="mb-4">
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Base URL
            </label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder={BASE_URLS[form.provider]}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </section>
        )}

        {/* Model */}
        <section className="mb-4">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            模型
          </label>
          <input
            type="text"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder={DEFAULT_MODELS[form.provider]}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </section>

        {/* Temperature */}
        <section className="mb-6">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Temperature <span className="font-normal">(创造力)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) =>
                setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))
              }
              className="flex-1"
            />
            <span
              className="w-8 text-right text-xs tabular-nums"
              style={{ color: 'var(--text-secondary)' }}
            >
              {form.temperature.toFixed(1)}
            </span>
          </div>
        </section>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !form.model}
          className="w-full rounded-xl py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? '保存中...' : '保存并应用'}
        </button>

        {message && (
          <div
            className="mt-3 rounded-xl border px-4 py-2 text-xs"
            style={{
              background:
                message.type === 'ok' ? 'var(--success-light)' : 'var(--error-light)',
              borderColor:
                message.type === 'ok' ? 'var(--success)' : 'var(--error)',
              color:
                message.type === 'ok' ? 'var(--success)' : 'var(--error)',
            }}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
