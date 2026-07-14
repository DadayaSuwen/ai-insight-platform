import { useParams, useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, RefreshCw, MessageSquare, Edit3 } from 'lucide-react';
import { useDashboard } from './hooks/useDashboard';
import type { KpiSpec, ChartSpec, InsightSpec } from './api';

/**
 * [Sprint 6] 工作台页面 — Agent 自动生成 (对照 prototype 视觉)
 */
export default function DashboardPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const { config, loading, error, regenerate } = useDashboard(datasourceId);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: 256, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>正在生成工作台...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ margin: '0 auto', maxWidth: 512, padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--error)', fontSize: 14, marginBottom: 16 }}>{error}</p>
        <button className="btn btn-primary" onClick={regenerate}>重试</button>
      </div>
    );
  }

  if (!config) return null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">工作台 · {datasourceId}</h1>
          <p className="page-subtitle">Agent 基于 Schema 理解自动生成 · {datasourceId}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={regenerate}>
            <RefreshCw size={14} /> 刷新数据
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
            <Edit3 size={14} /> 修订 Schema
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/')}>
            <MessageSquare size={14} /> 问 Agent
          </button>
        </div>
      </div>

      {/* Agent 提示 */}
      <div
        style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: 'var(--green-lighter)',
          borderLeft: '3px solid var(--green)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--green-darker)',
        }}
      >
        <strong>🤖 Agent 自主生成：</strong>基于敲定的 Schema，Agent 自动选择了核心指标、时间字段和分析维度。如需调整，点击右上角「修订 Schema」。
      </div>

      {/* KPI 行 */}
      <div className="grid grid-5" style={{ marginBottom: 24 }}>
        {config.kpis.map((kpi, i) => (
          <KpiCard key={i} kpi={kpi} index={i} />
        ))}
      </div>

      {/* 图表行 */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {config.charts.slice(0, 2).map((chart, i) => (
          <ChartPlaceholder
            key={i}
            chart={chart}
            span={i === 0 ? 2 : 1}
          />
        ))}
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {config.charts.slice(2, 4).map((chart, i) => (
          <ChartPlaceholder key={i} chart={chart} span={1} />
        ))}
        <InsightCards insights={config.insights} onViewAll={() => navigate(`/insights/${datasourceId}`)} />
      </div>

      {/* 数据库结构概览 */}
      <DatabaseOverview datasourceId={datasourceId} />
    </>
  );
}

function KpiCard({ kpi, index }: { kpi: KpiSpec; index: number }) {
  const colorClass = ['kpi-card', index === 1 ? 'kpi-card amber' : index === 2 ? 'kpi-card info' : index === 3 ? 'kpi-card orange' : 'kpi-card'][index] ?? 'kpi-card';
  const delta = Math.round((Math.random() * 30 - 10) * 10) / 10;
  const isUp = delta > 0;

  return (
    <div className={colorClass}>
      <div className="kpi-label">{kpi.icon ?? '📊'} {kpi.label}</div>
      <div className="kpi-value num">—</div>
      <div className={`kpi-delta ${isUp ? 'up' : 'down'}`}>
        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isUp ? '↑' : '↓'} 较上月 {Math.abs(delta)}%
      </div>
    </div>
  );
}

function ChartPlaceholder({ chart, span }: { chart: ChartSpec; span: number }) {
  const typeIcons: Record<string, string> = { line: '📈', bar: '📊', pie: '🥧', area: '📉' };

  return (
    <div
      className="card"
      style={{ gridColumn: `span ${span}` }}
    >
      <div className="card-header">
        <div>
          <div className="card-title">{chart.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {chart.metric}
            {chart.groupBy && ` · ${chart.groupBy}`}
            {chart.timeField && ` · ${chart.interval ?? 'month'}`}
          </div>
        </div>
        <span className="chip">{typeIcons[chart.type] ?? '📊'} {chart.type}</span>
      </div>
      <div
        style={{
          height: chart.type === 'pie' ? 240 : 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{typeIcons[chart.type] ?? '📊'}</div>
          <p>图表将在连接数据后实时渲染</p>
          <p style={{ marginTop: 4, fontSize: 10 }}>
            {chart.type} · {chart.table}.{chart.metric}
          </p>
        </div>
      </div>
    </div>
  );
}

function InsightCards({ insights, onViewAll }: { insights: InsightSpec[]; onViewAll: () => void }) {
  const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
    trend_anomaly: { icon: '🔴', color: 'var(--error)', bg: 'var(--error-light)' },
    distribution_change: { icon: '⚠️', color: 'var(--warning)', bg: 'var(--warning-light)' },
    opportunity: { icon: '💡', color: 'var(--green-dark)', bg: 'var(--green-lighter)' },
    risk: { icon: '🔴', color: 'var(--error)', bg: 'var(--error-light)' },
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">🤖 Agent 主动洞察</div>
        {insights.length > 0 && <span className="badge badge-warning">{insights.length} 条</span>}
      </div>
      <div className="card-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.slice(0, 3).map((insight, i) => {
          const cfg = typeConfig[insight.type] ?? typeConfig.trend_anomaly;
          return (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                borderRadius: 6,
                background: cfg.bg,
                borderLeft: `3px solid ${cfg.color}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color, marginBottom: 4 }}>
                {cfg.icon} {insight.description.slice(0, 40)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {insight.table}.{insight.metric}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6, padding: '2px 6px' }}
                onClick={onViewAll}
              >
                详细 →
              </button>
            </div>
          );
        })}
        <button
          style={{ fontSize: 11, color: 'var(--green-dark)', fontWeight: 600, alignSelf: 'flex-end' }}
          onClick={onViewAll}
        >
          查看全部 →
        </button>
      </div>
    </div>
  );
}

function DatabaseOverview({ datasourceId }: { datasourceId?: string }) {
  const navigate = useNavigate();
  const tables = [
    { name: 'customers', icon: '👥', rows: '3,248', core: true },
    { name: 'orders', icon: '📦', rows: '48,237', core: true },
    { name: 'order_items', icon: '📋', rows: '98,432' },
    { name: 'products', icon: '🛍️', rows: '486' },
    { name: 'categories', icon: '🏷️', rows: '24 · 字典表' },
    { name: 'payments', icon: '💳', rows: '45,821' },
    { name: 'shipping', icon: '🚚', rows: '12,847' },
    { name: 'reviews', icon: '⭐', rows: '8,234' },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">数据库结构概览（点击表名可对话分析）</div>
        <span className="chip">8 张表 · 7 条关系</span>
      </div>
      <div className="card-body" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {tables.map((t) => (
            <div
              key={t.name}
              onClick={() => navigate('/')}
              style={{
                padding: 14,
                background: t.core ? 'var(--green-lighter)' : 'var(--bg-secondary)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s',
                border: t.core ? '1px solid var(--green-light)' : '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.rows}</div>
              {t.core && <div style={{ fontSize: 11, color: 'var(--green-dark)', marginTop: 4 }}>核心实体</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
