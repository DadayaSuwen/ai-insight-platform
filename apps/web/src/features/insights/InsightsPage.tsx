/**
 * [Fix-10 Task 10.3] 主动洞察页 — 接入真实 API
 *
 * 删除 Fix-7 mock (INSIGHTS 数组)
 * 改用 insightsApi.list / dismiss / shield
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { insightsApi, type Insight } from './api';
import { toast } from '../../store/toast';

const SEVERITY_CONFIG: Record<string, { icon: string; bg: string; accent: string; label: string }> = {
  high: { icon: '🔴', bg: 'var(--error-light)', accent: 'var(--error)', label: '高' },
  medium: { icon: '⚠️', bg: 'var(--warning-light)', accent: 'var(--warning)', label: '中' },
  low: { icon: '💡', bg: 'var(--green-lighter)', accent: 'var(--green-dark)', label: '低' },
};

const TYPE_LABELS: Record<string, string> = {
  risk: '风险',
  anomaly: '异常',
  opportunity: '机会',
  trend_anomaly: '趋势异常',
  distribution_change: '分布变化',
};

export default function InsightsPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<string>('all');

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    setError(null);
    insightsApi.list(datasourceId, range)
      .then((data) => {
        setInsights(data);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [datasourceId, range]);

  const handleDismiss = async (id: string) => {
    try {
      await insightsApi.dismiss(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
      toast.success('已标记为已处理');
    } catch (err) {
      console.error('Dismiss failed', err);
      toast.error('操作失败');
    }
  };

  const handleShield = async (id: string) => {
    try {
      await insightsApi.shield(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
      toast.success('已屏蔽此类洞察');
    } catch (err) {
      console.error('Shield failed', err);
      toast.error('操作失败');
    }
  };

  const highCount = insights.filter((i) => i.severity === 'high').length;
  const mediumCount = insights.filter((i) => i.severity === 'medium').length;
  const lowCount = insights.filter((i) => i.severity === 'low').length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">主动洞察 · Agent 自主发现</h1>
          <p className="page-subtitle">Agent 每日定时巡检 · 共 {insights.length} 条洞察</p>
        </div>
        <div className="page-actions">
          <select className="input" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 110 }}>
            <option value="today">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="all">全部</option>
          </select>
        </div>
      </div>

      {/* 巡检状态卡 */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-lighter)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {loading ? '加载中...' : error ? '加载失败' : insights.length > 0 ? '洞察已就绪' : '暂无洞察'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {insights.length > 0 ? `共 ${insights.length} 条洞察` : 'Agent 会在每日巡检时自动发现异常与机会'}
            </div>
          </div>
        </div>
        {insights.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {highCount > 0 && <span className="badge badge-error">{highCount} 高风险</span>}
            {mediumCount > 0 && <span className="badge badge-warning">{mediumCount} 异常</span>}
            {lowCount > 0 && <span className="badge badge-success">{lowCount} 机会</span>}
          </div>
        )}
      </div>

      {/* 加载 / 错误 */}
      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          加载洞察中...
        </div>
      )}
      {error && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--error)', marginBottom: 12, fontSize: 13 }}>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setRange(range)}>重试</button>
        </div>
      )}

      {/* 空态 */}
      {!loading && !error && insights.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>暂无洞察</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Agent 会在每日巡检时自动发现异常与机会</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            或手动运行：<code style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>POST /api/insights/run-now?datasourceId={datasourceId}</code>
          </p>
        </div>
      )}

      {/* 洞察卡片列表 */}
      {!loading && !error && insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {insights.map((ins) => {
            const cfg = SEVERITY_CONFIG[ins.severity] ?? SEVERITY_CONFIG.medium;
            const typeLabel = TYPE_LABELS[ins.type] ?? ins.type;

            return (
              <div key={ins.id} className="card">
                <div className="card-header" style={{ background: cfg.bg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                    <div>
                      <div className="card-title" style={{ color: cfg.accent }}>{ins.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {typeLabel} · 严重度 {cfg.label} · {ins.status === 'active' ? '待处理' : '已处理'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(ins.id)}>标记已处理</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleShield(ins.id)}>屏蔽此类</button>
                  </div>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                    {ins.description}
                  </p>

                  {/* 证据 / 探索过程 */}
                  {ins.evidence && Object.keys(ins.evidence).length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>🔍 Agent 探索过程</div>
                      {ins.evidence.explorationSteps ? (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: '"SF Mono", Menlo, monospace' }}>
                          {(ins.evidence.explorationSteps as string[]).map((s, i) => (
                            <div key={i}>{s}</div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {JSON.stringify(ins.evidence, null, 2)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 建议 */}
                  {ins.suggestion && (
                    <div style={{ background: cfg.bg, borderLeft: `3px solid ${cfg.accent}`, borderRadius: 6, padding: '10px 14px', fontSize: 12 }}>
                      <strong style={{ color: cfg.accent }}>💡 Agent 建议：</strong>
                      <span>{ins.suggestion}</span>
                    </div>
                  )}
                </div>
                <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>发现时间：{new Date(ins.detectedAt).toLocaleString('zh-CN')}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/chat/${ins.datasourceId}`)}>
                    深入对话分析 →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
