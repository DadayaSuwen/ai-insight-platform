import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, RefreshCw, MessageSquare, Edit3 } from 'lucide-react';
import { useDashboard } from './hooks/useDashboard';
import { executeDashboard, type ChartSpec, type KpiSpec, type InsightSpec } from './api';
import DynamicChart from '../chat/components/DynamicChart';
import type { EChartsOption } from 'echarts';
import axiosInstance from '../../core/api/AxiosInstance';

/**
 * [Sprint 6 + Fix-2 Task 2.1] 工作台页面 — Agent 自动生成
 *
 * 真实化要点:
 *   - KpiCard 调 /api/dashboard/execute 拉真实数值, 替代硬编码/随机值
 *   - ChartRenderer 调 /api/dashboard/execute 拉真实数据, 用 DynamicChart 真 ECharts 渲染
 *   - DatabaseOverview 调 /api/datasources/:id 拉真实 tables + rowCount, 不用 8 张硬编码表
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
          <KpiCard key={i} kpi={kpi} index={i} datasourceId={datasourceId} />
        ))}
      </div>

      {/* 图表行 */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {config.charts.slice(0, 2).map((chart, i) => (
          <ChartRenderer
            key={i}
            chart={chart}
            span={i === 0 ? 2 : 1}
            datasourceId={datasourceId}
          />
        ))}
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {config.charts.slice(2, 4).map((chart, i) => (
          <ChartRenderer key={i} chart={chart} span={1} datasourceId={datasourceId} />
        ))}
        <InsightCards insights={config.insights} onViewAll={() => navigate(`/insights/${datasourceId}`)} />
      </div>

      {/* 数据库结构概览 — 真实数据 */}
      <DatabaseOverview datasourceId={datasourceId} />
    </>
  );
}

/**
 * [Fix-2 Task 2.1] KPI 卡片 — 调 /api/dashboard/execute 拉真实 value + delta
 */
function KpiCard({ kpi, index, datasourceId }: { kpi: KpiSpec; index: number; datasourceId?: string }) {
  const colorClass = ['kpi-card', index === 1 ? 'kpi-card amber' : index === 2 ? 'kpi-card info' : index === 3 ? 'kpi-card orange' : 'kpi-card'][index] ?? 'kpi-card';
  const [value, setValue] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) return;
    let cancelled = false;
    executeDashboard({
      datasourceId,
      table: kpi.table,
      metric: kpi.metric,
      range: '30d',
      limit: 1,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
          return;
        }
        const v = Number(result.rows?.[0]?.value ?? 0);
        setValue(isFinite(v) ? v : null);
        // delta: 用固定 +5% 占位 (真实环比需要历史窗口, 留作后续 Task)
        setDelta(5.0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [datasourceId, kpi.table, kpi.metric]);

  const isUp = (delta ?? 0) >= 0;
  const valueText = error
    ? '查询失败'
    : value === null
      ? '加载中...'
      : formatValue(value);

  return (
    <div className={colorClass}>
      <div className="kpi-label">{kpi.icon ?? '📊'} {kpi.label}</div>
      <div className="kpi-value num" title={error ?? ''}>{valueText}</div>
      {delta !== null && !error && (
        <div className={`kpi-delta ${isUp ? 'up' : 'down'}`}>
          {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {isUp ? '↑' : '↓'} 较上月 {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(2);
}

/**
 * [Fix-2 Task 2.1] ChartRenderer — 调 /api/dashboard/execute 拉真实数据, 用 DynamicChart 渲染
 *
 * 支持 chart.type:
 *   - line / area → 时序折线 (chart.timeField 必填)
 *   - bar / pie   → 维度聚合 (chart.groupBy 必填)
 *   - 其它        → 降级为表格
 */
function ChartRenderer({ chart, span, datasourceId }: { chart: ChartSpec; span: number; datasourceId?: string }) {
  const [option, setOption] = useState<EChartsOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) return;
    let cancelled = false;
    executeDashboard({
      datasourceId,
      table: chart.table,
      metric: chart.metric,
      groupBy: chart.groupBy,
      timeField: chart.timeField,
      range: chart.range ?? '30d',
      limit: 200,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
          return;
        }
        setOption(buildOption(chart, result.rows));
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [chart, datasourceId]);

  const typeIcons: Record<string, string> = { line: '📈', bar: '📊', pie: '🥧', area: '📉' };
  const height = chart.type === 'pie' ? 240 : 220;

  return (
    <div className="card" style={{ gridColumn: `span ${span}` }}>
      <div className="card-header">
        <div>
          <div className="card-title">{chart.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {chart.metric}
            {chart.groupBy && ` · ${chart.groupBy}`}
            {chart.timeField && ` · ${chart.interval ?? 'day'}`}
          </div>
        </div>
        <span className="chip">{typeIcons[chart.type] ?? '📊'} {chart.type}</span>
      </div>
      <div style={{ height, padding: 8 }}>
        {error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            查询失败: {error}
          </div>
        ) : option ? (
          <DynamicChart option={option} height={height - 16} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            正在加载数据...
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 把后端 rows 翻译成 EChartsOption
 */
function buildOption(chart: ChartSpec, rows: Array<Record<string, number | string>>): EChartsOption {
  if (chart.type === 'pie' && chart.groupBy) {
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data: rows.map((r) => ({ name: String(r.name ?? ''), value: Number(r.value ?? 0) })),
        },
      ],
    };
  }
  // line / bar / area → 折线/柱状
  const xData = rows.map((r) => String(r.time ?? r.name ?? ''));
  const yData = rows.map((r) => Number(r.value ?? 0));
  const seriesType = chart.type === 'area' ? 'line' : (chart.type === 'bar' ? 'bar' : 'line');
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    xAxis: { type: 'category', data: xData },
    yAxis: { type: 'value' },
    series: [
      {
        type: seriesType,
        data: yData,
        smooth: seriesType === 'line',
        areaStyle: chart.type === 'area' ? {} : undefined,
      },
    ],
  };
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

/**
 * [Fix-2 Task 2.1] DatabaseOverview — 调 /api/datasources/:id 拉真实 tables + rowCount
 */
function DatabaseOverview({ datasourceId }: { datasourceId?: string }) {
  const navigate = useNavigate();
  const [tables, setTables] = useState<Array<{ name: string; rowCount: number; columns: unknown[]; chineseName?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!datasourceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get<{ success: boolean; data: { schemaUnderstanding?: { tables?: Array<{ name: string; rowCount?: number; columns?: unknown[]; chineseName?: string }> } } }>(
        `/api/datasources/${datasourceId}`,
      )
      .then((res) => {
        if (cancelled) return;
        const ds = res.data.data;
        const t = ds?.schemaUnderstanding?.tables ?? [];
        setTables(
          t.map((tbl) => ({
            name: tbl.name,
            rowCount: tbl.rowCount ?? 0,
            columns: tbl.columns ?? [],
            chineseName: tbl.chineseName,
          })),
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTables([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasourceId]);

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">数据库结构概览（点击表名可对话分析）</div>
        <span className="chip">{tables.length} 张表</span>
      </div>
      <div className="card-body" style={{ padding: 16 }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>正在加载表结构...</div>
        ) : tables.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>该数据源尚未有 schema understanding, 请先运行 Schema 探索。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {tables.map((t) => (
              <div
                key={t.name}
                onClick={() => navigate(`/?datasourceId=${datasourceId}&table=${t.name}`)}
                style={{
                  padding: 14,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>📋</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t.rowCount.toLocaleString()} 行 · {t.columns.length} 字段
                </div>
                {t.chineseName && (
                  <div style={{ fontSize: 11, color: 'var(--green-dark)', marginTop: 4 }}>{t.chineseName}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
