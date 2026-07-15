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
      <div className="card mb-4 px-[18px] py-[14px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-full" style={{ background: 'var(--green-lighter)', color: 'var(--green-dark)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <div>
            <div className="text-sm font-semibold">
              {loading ? '加载中...' : error ? '加载失败' : insights.length > 0 ? '洞察已就绪' : '暂无洞察'}
            </div>
            <div className="text-xs text-muted">
              {insights.length > 0 ? `共 ${insights.length} 条洞察` : 'Agent 会在每日巡检时自动发现异常与机会'}
            </div>
          </div>
        </div>
        {insights.length > 0 && (
          <div className="flex gap-1.5">
            {highCount > 0 && <span className="badge badge-error">{highCount} 高风险</span>}
            {mediumCount > 0 && <span className="badge badge-warning">{mediumCount} 异常</span>}
            {lowCount > 0 && <span className="badge badge-success">{lowCount} 机会</span>}
          </div>
        )}
      </div>

      {/* 加载 / 错误 */}
      {loading && (
        <div className="p-16 text-center text-muted text-sm">
          加载洞察中...
        </div>
      )}
      {error && (
        <div className="p-10 text-center">
          <p className="text-error mb-3 text-sm">{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setRange(range)}>重试</button>
        </div>
      )}

      {/* 空态 */}
      {!loading && !error && insights.length === 0 && (
        <div className="p-16 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-base font-semibold text-default mb-1.5">暂无洞察</p>
          <p className="text-sm text-muted">Agent 会在每日巡检时自动发现异常与机会</p>
          <p className="text-xs text-muted mt-2">
            或手动运行：<code className="font-mono bg-muted px-1.5 py-0.5 rounded">POST /api/insights/run-now?datasourceId={datasourceId}</code>
          </p>
        </div>
      )}

      {/* 洞察卡片列表 */}
      {!loading && !error && insights.length > 0 && (
        <div className="flex flex-col gap-4">
          {insights.map((ins) => {
            const typeLabel = TYPE_LABELS[ins.type] ?? ins.type;

            return (
              <div key={ins.id} className="card">
                <div className={`card-header sev-${ins.severity}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{SEVERITY_CONFIG[ins.severity]?.icon ?? '⚠️'}</span>
                    <div>
                      <div className="card-title">{ins.title}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {typeLabel} · 严重度 {SEVERITY_CONFIG[ins.severity]?.label ?? '中'} · {ins.status === 'active' ? '待处理' : '已处理'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(ins.id)}>标记已处理</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleShield(ins.id)}>屏蔽此类</button>
                  </div>
                </div>
                <div className="card-body">
                  <p className="text-sm text-default leading-relaxed m-0 mb-3">
                    {ins.description}
                  </p>

                  {/* 证据 / 探索过程 */}
                  {ins.evidence && Object.keys(ins.evidence).length > 0 && (
                    <div className="bg-muted rounded-lg p-3 mb-3">
                      <div className="text-xs text-muted mb-1.5">🔍 Agent 探索过程</div>
                      {ins.evidence.explorationSteps ? (
                        <div className="text-xs text-secondary leading-relaxed font-mono-custom">
                          {(ins.evidence.explorationSteps as string[]).map((s, i) => (
                            <div key={i}>{s}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-secondary font-mono">
                          {JSON.stringify(ins.evidence, null, 2)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 建议 */}
                  {ins.suggestion && (
                    <div className={`rounded-md px-3.5 py-2.5 text-xs sev-${ins.severity} border-l-4`}>
                      <strong>💡 Agent 建议：</strong>
                      <span>{ins.suggestion}</span>
                    </div>
                  )}
                </div>
                <div className="card-footer flex justify-between">
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
