/**
 * [Fix-7 Task 7.13] Schema 修订页 — 1:1 还原原型 PAGES.schema (pages.js L1087-1130)
 *
 * 当前 Schema 概览 + 3 个修订入口
 */
import { useParams, useNavigate } from 'react-router-dom';

const SCENARIOS = [
  { text: 'Agent 错误理解了某字段的含义,需要修正', icon: '💬', color: 'var(--green)', bg: 'var(--green-lighter)' },
  { text: '业务上线后字段含义发生变化', icon: '🔄', color: 'var(--orange)', bg: 'var(--orange-light)' },
  { text: '新增了字段、删除了表或调整了表结构', icon: '🆕', color: 'var(--info)', bg: 'var(--info-light)' },
  { text: '数据敏感级别变化,需要重新脱敏处理', icon: '🛡️', color: 'var(--amber)', bg: 'var(--warning-light)' },
];

export default function SchemaRevisePage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schema 修订 · 重新进入对话</h1>
          <p className="page-subtitle">数据库结构变化或 Agent 理解有误时,可重新进入纠错对话</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            导出 JSON
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId ?? 'mock'}`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            进入纠错对话
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">当前 Schema 理解(2026-07-14 14:32 敲定)</div>
          <span className="badge badge-success">已确认</span>
        </div>
        <div className="card-body" style={{ padding: 16 }}>
          <div className="grid grid-4">
            <StatBox value="8" label="业务表" color="var(--green-dark)" />
            <StatBox value="67" label="字段总数" color="var(--green-dark)" />
            <StatBox value="7" label="表关系" color="var(--green-dark)" />
            <StatBox value="2" label="敏感字段" color="var(--warning)" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">何时需要重新探索</div>
        </div>
        <div className="card-body" style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SCENARIOS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">修订入口</div></div>
        <div className="card-body" style={{ padding: 20 }}>
          <div className="grid grid-3">
            <div
              onClick={() => navigate(`/schema-review/${datasourceId ?? 'mock'}`)}
              style={{ padding: 20, background: 'var(--green-lighter)', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--green-light)' }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>进入纠错对话</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                与 Agent 对话,修正字段理解或补充业务上下文。保留已有探索结果,只修正有问题的部分。
              </div>
            </div>
            <div
              style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>完全重新探索</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                清空已有理解,从零开始探索。适用于数据库结构大规模重构后的场景。
              </div>
            </div>
            <div
              style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>手动编辑 JSON</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                直接编辑 Schema 理解的 JSON 配置,适用于高级用户或批量修改。
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatBox({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 16, background: 'var(--bg-secondary)', borderRadius: 10 }}>
      <div className="num" style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
