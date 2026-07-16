/**
 * 模型配置页 — 每个 Provider 卡片自带表单 state,
 * 两个卡片同时显示完整表单,可以分别配置、单独"设为活跃"。
 */
import { useEffect, useState } from 'react';
import { LLMProvider } from '@workspace/types';
import { useAppStore } from '../../core/store';
import { toast } from '../../store/toast';

type Tab = 'provider' | 'default' | 'quota' | 'log';
const TABS: Tab[] = ['provider', 'default', 'quota', 'log'];
const TAB_LABELS: Record<Tab, string> = {
  provider: 'Provider 配置',
  default: '默认模型',
  quota: 'Token 配额',
  log: '调用日志',
};

const PROVIDER_META: Record<LLMProvider, { name: string; icon: string; models: string }> = {
  [LLMProvider.OPENAI]: { name: 'OpenAI', icon: '🤖', models: 'gpt-4o / gpt-4o-mini' },
  [LLMProvider.ANTHROPIC]: { name: 'Anthropic', icon: '🧠', models: 'claude-3-5-sonnet / haiku' },
};

function getDefaultBaseUrl(p: LLMProvider): string {
  return p === LLMProvider.OPENAI ? 'https://api.openai.com/v1' : 'https://api.anthropic.com';
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/* ───────── Provider 卡片 (自带表单 state) ───────── */

function ProviderCard({ provider }: { provider: LLMProvider }) {
  const meta = PROVIDER_META[provider];
  const saved = useAppStore((s) => s.llmConfigs[provider]);
  const isActive = useAppStore((s) => s.activeProvider === provider);
  const saveLlmConfig = useAppStore((s) => s.saveLlmConfig);
  const activateProvider = useAppStore((s) => s.activateProvider);
  const fetchLlmConfig = useAppStore((s) => s.fetchLlmConfig);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState(getDefaultBaseUrl(provider));
  const [model, setModel] = useState(
    provider === LLMProvider.OPENAI ? 'gpt-4o-mini' : 'claude-3-5-sonnet',
  );
  const [temperature, setTemperature] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 已保存配置变化时,若当前未编辑则同步到表单
  useEffect(() => {
    if (saved && !dirty) {
      setBaseUrl(saved.baseUrl ?? getDefaultBaseUrl(provider));
      setModel(saved.model);
      setTemperature(saved.temperature);
    }
  }, [saved, provider, dirty]);

  // isActive 切换时,刷新 saved 配置 (确保显示最新)
  useEffect(() => {
    if (isActive) fetchLlmConfig();
  }, [isActive, fetchLlmConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLlmConfig({
        provider,
        apiKey: apiKeyInput || undefined,
        baseUrl,
        model,
        temperature,
      });
      toast.success(`${meta.name} 配置已保存`);
      setApiKeyInput('');
      setDirty(false);
    } catch (err) {
      toast.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      const result = await activateProvider(provider);
      if (result.ok) {
        toast.success(`已切换到 ${meta.name}`);
      } else {
        toast.error(`切换失败: ${result.message}`);
      }
    } catch (err) {
      toast.error(`切换失败: ${(err as Error).message}`);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      className="card"
      style={
        isActive
          ? {
              borderColor: "var(--green)",
              boxShadow: "0 0 0 2px var(--green-lighter)",
              background: "var(--green-bg)",
            }
          : undefined
      }
    >
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <div>
            <div className="card-title">
              {meta.name}
              {isActive && (
                <span
                  className="chip ml-1.5 text-[10px]"
                  style={{ background: "var(--green)", color: "white" }}
                >
                  ✓ 活跃
                </span>
              )}
            </div>
            <div className="text-xs text-muted">{meta.models}</div>
          </div>
        </div>
        <span className={`badge ${saved?.apiKey ? 'badge-success' : 'badge-warning'}`}>
          {saved?.apiKey ? '已配置' : '未配置'}
        </span>
      </div>
      <div className="card-body p-4">
        <div className="mb-3">
          <label className="input-label">API Key</label>
          <input
            className="input"
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setDirty(true);
            }}
            placeholder={saved?.apiKey ? `已保存 (${maskKey(saved.apiKey)})` : '输入 API Key'}
          />
        </div>
        <div className="mb-3">
          <label className="input-label">Base URL</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="mb-3">
          <label className="input-label">模型</label>
          <input
            className="input"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="mb-3">
          <label className="input-label">Temperature ({temperature})</label>
          <input
            className="input p-0"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => {
              setTemperature(parseFloat(e.target.value));
              setDirty(true);
            }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {!isActive && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleActivate}
              disabled={activating || saving}
              title="将此 Provider 设为当前活跃(后端调用会走这个)"
            >
              {activating ? '切换中...' : isActive ? '✓ 当前活跃' : '设为活跃'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── 主页面 ───────── */

export default function LlmConfigPage() {
  const [tab, setTab] = useState<Tab>('provider');
  const fetchLlmConfig = useAppStore((s) => s.fetchLlmConfig);

  useEffect(() => {
    fetchLlmConfig();
  }, [fetchLlmConfig]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">模型配置</h1>
          <p className="page-subtitle">配置 LLM API Key 与模型选择 · 仅管理员可见</p>
        </div>
        <div className="page-actions">
          <span className="badge badge-warning">管理员专属</span>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      {/* Provider 配置 tab */}
      {tab === 'provider' && (
        <>
          <div className="grid grid-2 mb-6">
            {(Object.keys(PROVIDER_META) as LLMProvider[]).map((p) => (
              <ProviderCard key={p} provider={p} />
            ))}
          </div>

          <div
            className="px-3.5 py-3 rounded-lg text-xs text-error"
            style={{ background: 'var(--error-light)' }}
          >
            🔐 API Key 通过 AES-256-GCM 加密后存入数据库,不进日志,不下发给前端。
          </div>
        </>
      )}

      {tab === 'default' && (
        <div className="card mb-4">
          <div className="card-header"><div className="card-title">默认模型选择</div></div>
          <div className="card-body p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Schema 理解模型(消耗较多 Token)</label>
                <select className="input">
                  <option>gpt-4o (推荐 · 准确率高)</option>
                  <option>gpt-4o-mini (省钱)</option>
                  <option>claude-3-5-sonnet</option>
                </select>
                <div className="text-xs text-muted mt-1">用于:字段语义推断 · 表关系识别 · 提问生成</div>
              </div>
              <div>
                <label className="input-label">对话分析模型(高频调用)</label>
                <select className="input">
                  <option>gpt-4o-mini (推荐 · 性价比高)</option>
                  <option>gpt-4o</option>
                  <option>claude-3-5-haiku</option>
                </select>
                <div className="text-xs text-muted mt-1">用于:对话追问 · SQL 生成 · 洞察分析</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'quota' && (
        <div className="card">
          <div className="card-header"><div className="card-title">Token 配额</div></div>
          <div className="card-body p-5">
            <div className="text-sm text-secondary">
              Token 配额由各 Provider 控制,可在此页面配置 API Key 后使用。
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="card">
          <div className="card-header"><div className="card-title">调用日志</div></div>
          <div className="card-body p-5">
            <div className="text-sm text-muted">
              调用日志功能开发中。可在服务端通过{' '}
              <code className="font-mono-custom bg-muted px-1.5 py-0.5 rounded">
                CHART_DEBUG=1
              </code>{' '}
              开启详细日志。
            </div>
          </div>
        </div>
      )}
    </>
  );
}