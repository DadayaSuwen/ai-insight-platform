/**
 * [Fix-7 Task 7.15] 模型配置页 — 1:1 还原原型 PAGES['llm-config'] (pages.js L1157+)
 *
 * 4 tab + 3 Provider 卡片 + 默认模型选择 + 高级参数
 */
import { useState } from 'react';

type Tab = 'provider' | 'default' | 'quota' | 'log';
const TABS: Tab[] = ['provider', 'default', 'quota', 'log'];
const TAB_LABELS: Record<Tab, string> = {
  provider: 'Provider 配置',
  default: '默认模型',
  quota: 'Token 配额',
  log: '调用日志',
};

interface Provider {
  name: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  models: string;
  configured: boolean;
  apiKey: string;
  baseUrl?: string;
  local?: boolean;
}

const PROVIDERS: Provider[] = [
  { name: 'OpenAI', icon: '🤖', iconBg: 'var(--info-light)', iconColor: 'var(--info)', models: 'gpt-4o / gpt-4o-mini', configured: true, apiKey: 'sk-proj-xxxxxxxxxxxxxxxxxxxx', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Anthropic', icon: '🧠', iconBg: 'var(--warning-light)', iconColor: 'var(--warning)', models: 'claude-3-5-sonnet / haiku', configured: false, apiKey: '' },
  { name: '本地 LLM', icon: '🏠', iconBg: 'var(--green-lighter)', iconColor: 'var(--green-dark)', models: 'Qwen / Llama (私有部署)', configured: false, apiKey: '', local: true },
];

export default function LlmConfigPage() {
  const [tab, setTab] = useState<Tab>('provider');

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
          <div className="grid grid-3" style={{ marginBottom: 24 }}>
            {PROVIDERS.map((p) => (
              <div key={p.name} className="card">
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: p.iconBg, color: p.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{p.icon}</div>
                    <div>
                      <div className="card-title">{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.models}</div>
                    </div>
                  </div>
                  {p.configured ? (
                    <span className="badge badge-success">已配置</span>
                  ) : (
                    <span className="badge">未配置</span>
                  )}
                </div>
                <div className="card-body" style={{ padding: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label className="input-label">{p.local ? '服务地址' : 'API Key'}</label>
                    <input
                      className="input"
                      type={p.local ? 'text' : 'password'}
                      value={p.apiKey}
                      placeholder={p.local ? 'http://localhost:11434/v1' : (p.name === 'OpenAI' ? 'sk-proj-xxxxxxxx' : 'sk-ant-xxxxxxxx')}
                    />
                  </div>
                  {!p.local && (
                    <div style={{ marginBottom: 12 }}>
                      <label className="input-label">Base URL(可选)</label>
                      <input className="input" placeholder="https://api.openai.com/v1" defaultValue={p.baseUrl ?? ''} />
                    </div>
                  )}
                  {p.local && (
                    <div style={{ marginBottom: 12 }}>
                      <label className="input-label">模型名</label>
                      <input className="input" placeholder="qwen2.5-72b-instruct" />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} disabled={!p.configured && !p.local}>测试连接</button>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}>保存</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 14px', background: 'var(--error-light)', borderRadius: 8, fontSize: 12, color: 'var(--error)' }}>
            🔐 API Key 通过 AES-256-GCM 加密后存入数据库,不进日志,不下发给前端。
          </div>
        </>
      )}

      {tab === 'default' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">默认模型选择</div></div>
          <div className="card-body" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="input-label">Schema 理解模型(消耗较多 Token)</label>
                <select className="input">
                  <option>gpt-4o (推荐 · 准确率高)</option>
                  <option>gpt-4o-mini (省钱)</option>
                  <option>claude-3-5-sonnet</option>
                  <option>qwen2.5-72b (本地)</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>用于:字段语义推断 · 表关系识别 · 提问生成</div>
              </div>
              <div>
                <label className="input-label">对话分析模型(高频调用)</label>
                <select className="input">
                  <option>gpt-4o-mini (推荐 · 性价比高)</option>
                  <option>gpt-4o</option>
                  <option>claude-3-5-haiku</option>
                  <option>qwen2.5-72b (本地)</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>用于:对话追问 · SQL 生成 · 洞察分析</div>
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
              本月已用 <strong>1.4M</strong> / 总额度 <strong>5M</strong> · 剩余 3.6M tokens
            </div>
            <div style={{ marginTop: 12, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '28%', background: 'linear-gradient(90deg, var(--green), var(--green-dark))' }} />
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="card">
          <div className="card-header"><div className="card-title">最近调用日志</div></div>
          <table className="table">
            <thead><tr><th>时间</th><th>Provider</th><th>模型</th><th>输入</th><th>输出</th><th>耗时</th></tr></thead>
            <tbody>
              <tr>
                <td className="num" style={{ fontSize: 12 }}>14:32:08</td>
                <td>OpenAI</td>
                <td>gpt-4o-mini</td>
                <td className="num">3,420</td>
                <td className="num">812</td>
                <td className="num">1.4s</td>
              </tr>
              <tr>
                <td className="num" style={{ fontSize: 12 }}>14:31:55</td>
                <td>OpenAI</td>
                <td>gpt-4o</td>
                <td className="num">12,840</td>
                <td className="num">3,128</td>
                <td className="num">4.8s</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
