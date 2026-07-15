import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Lightbulb, Clock, ChevronDown, ChevronRight, ShieldOff, CheckCircle2 } from 'lucide-react';
import { insightsApi, type Insight } from './api';

/**
 * [Sprint 6 + Fix-2 Task 2.2] 主动洞察页 — 接真实 /api/insights
 */
export default function InsightsPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    insightsApi.list(datasourceId, range)
      .then((data) => {
        if (cancelled) return;
        setInsights(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasourceId, range]);

  const handleDismiss = (id: string) => {
    insightsApi.dismiss(id).then(() => {
      setInsights((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'handled' } : it)));
    });
  };

  const handleShield = (id: string) => {
    insightsApi.shield(id).then(() => {
      setInsights((prev) =>
        prev.map((it) => (it.id === id ? { ...it, severity: 'low' as const } : it)),
      );
    });
  };

  const todayInsights = insights.filter((it) => {
    if (range === 'all') return true;
    const detected = new Date(it.detectedAt).getTime();
    const now = Date.now();
    if (range === 'today') return detected >= new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    if (range === 'week') return detected >= now - 7 * 24 * 3600 * 1000;
    if (range === 'month') return detected >= now - 30 * 24 * 3600 * 1000;
    return true;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">主动洞察 · Agent 自主发现</h1>
          <p className="page-subtitle">
            Agent 每日定时巡检 · {loading ? '加载中...' : `共 ${todayInsights.length} 条${rangeLabel(range)}洞察`}
          </p>
        </div>
        <div className="page-actions">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as 'today' | 'week' | 'month' | 'all')}
            className="input"
            style={{ width: 120 }}
          >
            <option value="today">今日</option>
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="all">全部</option>
          </select>
          <button className="btn btn-secondary btn-sm">
            <Clock size={14} /> 配置巡检
          </button>
        </div>
      </div>

      {/* 巡检状态 */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--green-lighter)', color: 'var(--green-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Clock size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {loading ? '加载中...' : error ? '加载失败' : `共 ${todayInsights.length} 条洞察`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {error ? error : '由 InsightSchedulerService (cron 0 8 * * *) 每日 8:00 触发'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="badge badge-error">
            {todayInsights.filter((i) => i.type === 'risk').length} 风险
          </span>
          <span className="badge badge-warning">
            {todayInsights.filter((i) => i.type === 'anomaly').length} 异常
          </span>
          <span className="badge badge-success">
            {todayInsights.filter((i) => i.type === 'opportunity').length} 机会
          </span>
        </div>
      </div>

      {/* 洞察卡片列表 */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
          加载洞察中...
        </div>
      ) : todayInsights.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
          当前范围内没有洞察。可以等待每日 8:00 巡检,或点击右上角"配置巡检"手动触发。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {todayInsights.map((ins) => (
            <InsightCard
              key={ins.id}
              insight={ins}
              expanded={expandedId === ins.id}
              onToggle={() => setExpandedId(expandedId === ins.id ? null : ins.id)}
              onDismiss={() => handleDismiss(ins.id)}
              onShield={() => handleShield(ins.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function rangeLabel(r: 'today' | 'week' | 'month' | 'all'): string {
  if (r === 'today') return '今日';
  if (r === 'week') return '本周';
  if (r === 'month') return '本月';
  return '';
}

function InsightCard({
  insight,
  expanded,
  onToggle,
  onDismiss,
  onShield,
}: {
  insight: Insight;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onShield: () => void;
}) {
  const typeConfig: Record<string, { icon: string; color: string; bg: string; label: string }> = {
    risk: { icon: '🔴', color: 'var(--error)', bg: 'var(--error-light)', label: '风险' },
    anomaly: { icon: '⚠️', color: 'var(--warning)', bg: 'var(--warning-light)', label: '异常' },
    opportunity: { icon: '💡', color: 'var(--green-dark)', bg: 'var(--green-lighter)', label: '机会' },
  };
  const cfg = typeConfig[insight.type] ?? { icon: 'ℹ️', color: 'var(--text-secondary)', bg: 'var(--bg-secondary)', label: insight.type };

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ background: cfg.bg, borderBottom: '1px solid var(--border-light)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
          <div>
            <div className="card-title" style={{ color: cfg.color }}>{insight.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {cfg.label} · 严重度 {insight.severity}
              {insight.status === 'handled' && ' · 已处理'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss} disabled={insight.status === 'handled'}>
            <CheckCircle2 size={12} /> 标记已处理
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onShield}>
            <ShieldOff size={12} /> 屏蔽此类
          </button>
        </div>
      </div>

      <div className="card-body">
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{insight.description}</p>

        <button
          onClick={onToggle}
          style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? '收起' : '展开'} 异常检测证据
        </button>
        {expanded && (
          <div
            style={{
              marginTop: 8,
              background: 'var(--bg-secondary)', borderRadius: 8,
              padding: 12, fontFamily: '"SF Mono", Menlo, monospace',
              fontSize: 11, lineHeight: 1.7, color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(insight.evidence, null, 2)}
          </div>
        )}

        {insight.suggestion && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'var(--green-lighter)',
              borderLeft: '3px solid var(--green)',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <strong style={{ color: 'var(--green-darker)' }}>💡 Agent 建议：</strong>
            <span> {insight.suggestion}</span>
          </div>
        )}
      </div>

      <div className="card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>发现时间: {new Date(insight.detectedAt).toLocaleString('zh-CN')}</span>
        <button className="btn btn-ghost btn-sm">深入对话分析 →</button>
      </div>
    </div>
  );
}

// 静默使用未直接 import 的 icon, 避免 unused import
void AlertTriangle;
void Lightbulb;
