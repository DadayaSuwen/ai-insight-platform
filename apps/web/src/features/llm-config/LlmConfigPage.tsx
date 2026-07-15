/**
 * [Fix-11 Task 11.1] 模型配置页 — 接入真实 API
 *
 * 删除 Fix-7 mock (PROVIDERS 数组)
 * 改用 useAppStore.saveLlmConfig / fetchLlmConfig / fetchLlmHealth
 */
import { useEffect, useState } from 'react';
import { LLMProvider, type LLMConfig } from '@workspace/types';
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

export default function LlmConfigPage() {
  const [tab, setTab] = useState<Tab>('provider');
  const { llmConfigs, activeProvider, isLoadingConfig, fetchLlmConfig, saveLlmConfig, fetchLlmHealth, llmHealth } = useAppStore();

  // 当前选中的 provider（用于切换表单）
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(LLMProvider.OPENAI);

  // 表单 state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState(getDefaultBaseUrl(LLMProvider.OPENAI));
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);

  // 加载配置
  useEffect(() => {
    fetchLlmConfig();
  }, [fetchLlmConfig]);

  // 配置加载后预填表单
  useEffect(() => {
    const saved = llmConfigs[selectedProvider];
    if (saved) {
      setBaseUrl(saved.baseUrl ?? getDefaultBaseUrl(selectedProvider));
      setModel(saved.model);
      setTemperature(saved.temperature);
      // apiKeyInput 留空 — 保留已存的 key
    } else {
      setBaseUrl(getDefaultBaseUrl(selectedProvider));
      setModel(selectedProvider === LLMProvider.OPENAI ? 'gpt-4o-mini' : 'claude-3-5-sonnet');
      setTemperature(0);
    }
  }, [llmConfigs, selectedProvider]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLlmConfig({
        provider: selectedProvider,
        apiKey: apiKeyInput || undefined,
        baseUrl,
        model,
        temperature,
      });
      toast.success(`${PROVIDER_META[selectedProvider].name} 配置已保存`);
      setApiKeyInput('');
    } catch (err) {
      toast.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // 测试健康
  const handleTestHealth = async () => {
    setTestingHealth(true);
    try {
      await fetchLlmHealth();
      const health = useAppStore.getState().llmHealth;
      const ok = selectedProvider === LLMProvider.OPENAI ? health?.openai : health?.anthropic;
      toast.success(ok ? '连接正常' : '连接失败');
    } catch {
      toast.error('测试失败');
    } finally {
      setTestingHealth(false);
    }
  };

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
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      {/* Provider 配置 tab */}
      {tab === 'provider' && (
        <>
          <div className="grid grid-2" style={{ marginBottom: 24 }}>
            {(Object.keys(PROVIDER_META) as LLMProvider[]).map((p) => {
              const meta = PROVIDER_META[p];
              const saved = llmConfigs[p];
              const isActive = activeProvider === p;
              const isSelected = selectedProvider === p;

              return (
                <div key={p} className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{meta.icon}</span>
                      <div>
                        <div className="card-title">
                          {meta.name}
                          {isActive && <span className="chip green" style={{ marginLeft: 6, fontSize: 10 }}>活跃</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{meta.models}</div>
                      </div>
                    </div>
                    <span className={`badge ${saved?.apiKey ? 'badge-success' : 'badge-warning'}`}>
                      {saved?.apiKey ? '已配置' : '未配置'}
                    </span>
                  </div>
                  <div className="card-body" style={{ padding: 16 }}>
                    {isSelected ? (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <label className="input-label">API Key</label>
                          <input
                            className="input"
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder={saved?.apiKey ? `已保存 (${maskKey(saved.apiKey)})` : `输入 API Key`}
                          />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label className="input-label">Base URL</label>
                          <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label className="input-label">模型</label>
                          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label className="input-label">Temperature ({temperature})</label>
                          <input className="input" type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} style={{ padding: 0 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" onClick={handleTestHealth} disabled={testingHealth}>
                            {testingHealth ? '测试中...' : '测试连接'}
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                            {saving ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedProvider(p); setApiKeyInput(''); }}>
                        切换到此 Provider
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: '12px 14px', background: 'var(--error-light)', borderRadius: 8, fontSize: 12, color: 'var(--error)' }}>
            🔐 API Key 通过 AES-256-GCM 加密后存入数据库，不进日志，不下发给前端。
          </div>
        </>
      )}

      {tab === 'default' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">默认模型选择</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="input-label">Schema 理解模型（消耗较多 Token）</label>
                <select className="input">
                  <option>gpt-4o (推荐 · 准确率高)</option>
                  <option>gpt-4o-mini (省钱)</option>
                  <option>claude-3-5-sonnet</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>用于：字段语义推断 · 表关系识别 · 提问生成</div>
              </div>
              <div>
                <label className="input-label">对话分析模型（高频调用）</label>
                <select className="input">
                  <option>gpt-4o-mini (推荐 · 性价比高)</option>
                  <option>gpt-4o</option>
                  <option>claude-3-5-haiku</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>用于：对话追问 · SQL 生成 · 洞察分析</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'quota' && (
        <div className="card">
          <div className="card-header"><div className="card-title">Token 配额</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Token 配额由各 Provider 控制，可在此页面配置 API Key 后使用。
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="card">
          <div className="card-header"><div className="card-title">调用日志</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              调用日志功能开发中。可在服务端通过 <code style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>CHART_DEBUG=1</code> 开启详细日志。
            </div>
          </div>
        </div>
      )}
    </>
  );
}
