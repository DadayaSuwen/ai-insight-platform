import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../core/store';
import type { LLMConfig } from '@workspace/types';
import { LLMProvider } from '@workspace/types';
import { toast } from '../../store/toast';
import DataSourcesTab from '../datasources/DataSourcesTab';

type SettingsTab = 'llm' | 'datasources';

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'OpenAI',
  [LLMProvider.ANTHROPIC]: 'Anthropic',
};

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'gpt-4o-mini',
  [LLMProvider.ANTHROPIC]: 'claude-3-5-sonnet-20240620',
};

const BASE_URLS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: 'https://api.openai.com/v1',
  [LLMProvider.ANTHROPIC]: 'https://api.anthropic.com',
};

interface FormState {
  provider: LLMProvider;
  /** Raw text in the input. Empty means "don't change the saved key on save". */
  apiKeyInput: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

/** Build a masked display string from a real key, e.g. "sk-ant-...mn07". */
function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '••••••••';
  const head = key.slice(0, 6);
  const tail = key.slice(-4);
  return `${head}…${tail}`;
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
  const [searchParams, setSearchParams] = useSearchParams();
  // [Fix-5 Task 5.3] 读 URL ?tab= 参数, 默认 llm
  const initialTab = (searchParams.get('tab') as SettingsTab | null) || 'llm';
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  // 同步 tab 切换到 URL (浏览器后退/分享链接可用)
  const handleTabChange = (next: SettingsTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };
  const { llmConfigs, activeProvider, llmHealth, isLoadingConfig, fetchLlmConfig, saveLlmConfig, fetchLlmHealth } =
    useAppStore();

  const [form, setForm] = useState<FormState>({
    provider: LLMProvider.OPENAI,
    apiKeyInput: '',
    baseUrl: BASE_URLS[LLMProvider.OPENAI],
    model: DEFAULT_MODELS[LLMProvider.OPENAI],
    temperature: 0,
  });

  const [saving, setSaving] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);

  // Load config once on mount
  useEffect(() => {
    fetchLlmConfig();
  }, [fetchLlmConfig]);

  // When configs finish loading, pre-fill the currently selected provider.
  // We don't touch apiKeyInput here — that field is intentionally left empty
  // so the form shows the "saved key" hint instead of overwriting it on re-save.
  useEffect(() => {
    const saved = llmConfigs[form.provider];
    if (saved) {
      setForm((f) => ({
        ...f,
        baseUrl: saved.baseUrl ?? BASE_URLS[saved.provider],
        model: saved.model,
        temperature: saved.temperature,
        // apiKeyInput left empty — preserves existing key on next save.
      }));
    }
  }, [llmConfigs, form.provider]);

  const handleProviderChange = (p: LLMProvider) => {
    const saved = llmConfigs[p];
    setForm({
      provider: p,
      apiKeyInput: '',
      baseUrl: saved?.baseUrl ?? BASE_URLS[p],
      model: saved?.model ?? DEFAULT_MODELS[p],
      temperature: saved?.temperature ?? 0,
    });
  };

  const handleClearApiKey = async () => {
    setForm((f) => ({ ...f, apiKeyInput: '' }));
    // Persist the explicit clear to the DB.
    setSaving(true);
    const config: LLMConfig = {
      provider: form.provider,
      apiKey: '', // empty string is the explicit-clear signal to the backend
      baseUrl: form.baseUrl || undefined,
      model: form.model,
      temperature: form.temperature,
    };
    const result = await saveLlmConfig(config);
    setSaving(false);
    if (result.ok) {
      toast.success('API Key 已清除');
    } else {
      toast.error(`清除失败：${result.message}`);
    }
  };

  const handleSave = async () => {
    if (!form.model.trim()) {
      toast.error('模型名称不能为空');
      return;
    }
    setSaving(true);
    // Build the config — only attach apiKey when the user actually typed one.
    // Empty apiKeyInput + saved key = leave the saved key untouched (no field).
    // Empty apiKeyInput + no saved key = backend writes NULL (no-op for usage).
    const trimmedKey = form.apiKeyInput.trim();
    const hasSaved = Boolean(llmConfigs[form.provider]?.apiKey);
    const config: LLMConfig = {
      provider: form.provider,
      ...(trimmedKey
        ? { apiKey: trimmedKey }
        : !hasSaved
          ? { apiKey: '' } // first time saving this provider → explicit empty
          : {}), // user didn't edit → omit entirely → backend preserves DB key
      baseUrl: form.baseUrl || undefined,
      model: form.model,
      temperature: form.temperature,
    };
    const result = await saveLlmConfig(config);
    setSaving(false);
    if (result.ok) {
      toast.success('配置已保存并应用');
      // Reset the apiKey input so the next render shows the masked "saved" hint.
      setForm((f) => ({ ...f, apiKeyInput: '' }));
      setTimeout(() => navigate('/'), 800);
    } else {
      toast.error(`保存失败：${result.message}`);
    }
  };

  const handleTestHealth = async () => {
    setTestingHealth(true);
    await fetchLlmHealth();
    setTestingHealth(false);
  };

  const healthForProvider = (p: LLMProvider): boolean | undefined => {
    if (!llmHealth) return undefined;
    if (p === LLMProvider.OPENAI) return llmHealth.openai;
    if (p === LLMProvider.ANTHROPIC) return llmHealth.anthropic;
    return undefined;
  };

  const savedApiKey = llmConfigs[form.provider]?.apiKey;
  const savedApiKeyMasked = maskApiKey(savedApiKey);
  const apiKeyPlaceholder = form.provider === LLMProvider.OPENAI ? 'sk-...' : 'sk-ant-...';

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
          设置
        </h1>
      </header>

      {/* Top tabs (Sprint 3 — LLM / 数据源) */}
      <div
        className="flex border-b px-4"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
      >
        {(['llm', 'datasources'] as SettingsTab[]).map(t => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className="-mb-px border-b-2 px-3 py-2 text-xs transition-colors"
            style={{
              borderColor: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {t === 'llm' ? 'LLM' : '数据源'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto p-6">
        {tab === 'datasources' ? (
          <DataSourcesTab />
        ) : (
        <>
        {/* Provider selector */}
        <section className="mb-6">
          <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            提供商
          </p>
          <div className="flex gap-2">
            {([LLMProvider.OPENAI, LLMProvider.ANTHROPIC] as LLMProvider[]).map(
              (p) => {
                const isActiveTab = form.provider === p;
                const isActiveProvider = activeProvider === p;
                return (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className="flex flex-col items-center gap-1 rounded-xl border px-4 py-3 text-xs transition-all"
                    style={{
                      borderColor: isActiveTab ? 'var(--accent)' : 'var(--border)',
                      background: isActiveTab ? 'var(--accent-light)' : 'var(--bg-secondary)',
                      color: isActiveTab ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <span className="flex items-center gap-1">
                      {PROVIDER_LABELS[p]}
                      {isActiveProvider && (
                        <span
                          className="rounded px-1 py-0.5 text-[10px] font-medium"
                          style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                          使用中
                        </span>
                      )}
                    </span>
                    {llmHealth && (
                      <HealthDot ok={healthForProvider(p)} />
                    )}
                  </button>
                );
              },
            )}
          </div>
        </section>

        {/* Manual health test button */}
        <section className="mb-6">
          <button
            onClick={handleTestHealth}
            disabled={testingHealth}
            className="flex items-center gap-2 rounded-xl border px-4 py-2 text-xs transition-all"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            {testingHealth ? '测试中...' : '测试连接'}
          </button>
          {llmHealth && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              OpenAI: {healthForProvider(LLMProvider.OPENAI) === true ? '✓ 可用' : healthForProvider(LLMProvider.OPENAI) === false ? '✗ ' + (llmHealth ? 'API Key 未配置' : '不可用') : '未测试'}
              {' · '}
              Anthropic: {healthForProvider(LLMProvider.ANTHROPIC) === true ? '✓ 可用' : healthForProvider(LLMProvider.ANTHROPIC) === false ? '✗ ' + (llmHealth ? 'API Key 未配置' : '不可用') : '未测试'}
            </p>
          )}
        </section>

        {/* API Key */}
        <section className="mb-4">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            API Key
            {savedApiKeyMasked && !form.apiKeyInput && (
              <span
                className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-normal"
                style={{
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                }}
                title="已保存到数据库。重新输入将覆盖；留空则保留旧值。"
              >
                已保存 · {savedApiKeyMasked}
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={form.apiKeyInput}
              onChange={(e) => setForm((f) => ({ ...f, apiKeyInput: e.target.value }))}
              placeholder={apiKeyPlaceholder}
              className="flex-1 rounded-xl border px-3 py-2 text-sm"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {savedApiKey && (
              <button
                type="button"
                onClick={handleClearApiKey}
                disabled={saving}
                className="rounded-xl border px-3 py-2 text-xs transition-colors disabled:opacity-50"
                style={{
                  borderColor: 'var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                }}
                title="从数据库清除保存的 API Key"
              >
                清除
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            留空保存 = 保留已保存的 key；输入新值 = 覆盖；点「清除」= 显式清空。
          </p>
        </section>

        {/* Base URL */}
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
          disabled={saving || testingHealth || !form.model.trim()}
          className="w-full rounded-xl py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? '保存中...' : '保存并应用'}
        </button>
        </>
        )}
      </div>
    </div>
  );
}
