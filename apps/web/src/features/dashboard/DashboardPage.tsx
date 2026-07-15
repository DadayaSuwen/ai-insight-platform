/**
 * [Fix-10 Task 10.1] 工作台页 — 接入真实 API
 *
 * 删除 Fix-7 mock (KPI_DATA/ORDER_TREND/CHANNEL_PIE/TABLES)
 * 改用 generateDashboard + getDashboard + executeDashboard
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, RefreshCw, MessageSquare, Edit3, Loader2 } from 'lucide-react';
import * as echarts from 'echarts';
import { useDashboard } from './hooks/useDashboard';
import { executeDashboard, type KpiSpec, type ChartSpec } from './api';
import { toast } from '../../store/toast';

export default function DashboardPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();

  const { config, loading, error, regenerate } = useDashboard(datasourceId);

  const [kpiValues, setKpiValues] = useState<Record<string, number | null>>({});
  const [chartData, setChartData] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [dataLoading, setDataLoading] = useState(false);

  /* ─── 加载 KPI + 图表真实数据 ─── */
  const loadData = useCallback(async (kpis: KpiSpec[], charts: ChartSpec[]) => {
    if (!datasourceId) return;
    setDataLoading(true);

    // 并行加载所有 KPI
    const kpiPromises = kpis.map(async (kpi) => {
      try {
        const result = await executeDashboard({
          datasourceId,
          table: kpi.table,
          metric: kpi.metric,
        });
        const raw = result.rows?.[0]?.value;
        // pg 驱动 SUM() 返回 numeric 为字符串, 需转换
        const val = raw != null ? Number(raw) : NaN;
        return { label: kpi.label, value: Number.isFinite(val) ? val : null };
      } catch (err) {
        console.warn(`KPI "${kpi.label}" 加载失败`, err);
        return { label: kpi.label, value: null };
      }
    });

    // 并行加载所有图表
    const chartPromises = charts.map(async (chart) => {
      try {
        const result = await executeDashboard({
          datasourceId,
          table: chart.table,
          metric: chart.metric,
          groupBy: chart.groupBy,
          timeField: chart.timeField,
          range: chart.range || '30d',
        });
        return { title: chart.title, rows: result.rows ?? [] };
      } catch (err) {
        console.warn(`Chart "${chart.title}" 加载失败`, err);
        return { title: chart.title, rows: [] };
      }
    });

    const kpiResults = await Promise.all(kpiPromises);
    const kpiMap: Record<string, number | null> = {};
    for (const r of kpiResults) kpiMap[r.label] = r.value;
    setKpiValues(kpiMap);

    const chartResults = await Promise.all(chartPromises);
    const chartMap: Record<string, Array<Record<string, unknown>>> = {};
    for (const r of chartResults) chartMap[r.title] = r.rows;
    setChartData(chartMap);

    setDataLoading(false);
  }, [datasourceId]);

  useEffect(() => {
    if (config) {
      loadData(config.kpis, config.charts);
    }
  }, [config, loadData]);

  /* ─── 刷新 ─── */
  const handleRefresh = async () => {
    await regenerate();
    toast.success('工作台已刷新');
  };

  /* ─── 加载态 ─── */
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--green)' }} />
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Agent 正在生成工作台...</p>
      </div>
    );
  }

  /* ─── 错误态 ─── */
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--error)', marginBottom: 16 }}>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId}`)}>
          返回探索
        </button>
      </div>
    );
  }

  if (!config) return null;

  const dsName = datasourceId?.slice(0, 8) ?? '数据源';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">工作台 · {dsName}</h1>
          <p className="page-subtitle">
            Agent 基于 Schema 理解自动生成 · {config.kpis.length} KPI · {config.charts.length} 图表
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={14} /> 刷新
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
            <Edit3 size={14} /> 修订 Schema
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/chat/${datasourceId}`)}>
            <MessageSquare size={14} /> 问 Agent
          </button>
        </div>
      </div>

      {/* Agent 提示条 */}
      <div
        style={{
          marginBottom: 24,
          padding: '12px 16px',
          background: 'var(--green-lighter)',
          borderLeft: '3px solid var(--green)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--green-darker)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span>✦</span>
        <span>Agent 基于敲定的 Schema 自动生成了 {config.kpis.length} 个 KPI 卡片和 {config.charts.length} 个图表。如需调整维度或图表类型，在对话页直接告诉 Agent。</span>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-5" style={{ marginBottom: 24 }}>
        {config.kpis.map((kpi) => {
          const rawValue = kpiValues[kpi.label];
          const value = rawValue ?? undefined;
          const accent = kpi.icon?.includes('💰') ? 'amber'
            : kpi.icon?.includes('👥') ? 'info'
            : kpi.icon?.includes('⚠') ? 'amber'
            : '';

          return (
            <div key={kpi.label} className={`kpi-card ${accent}`}>
              <div className="kpi-label">{kpi.icon ? `${kpi.icon} ` : ''}{kpi.label}</div>
              <div className="kpi-value">
                {value !== undefined ? formatValue(value) : dataLoading ? '加载中...' : '—'}
              </div>
              {kpi.comparison && (
                <div className="kpi-delta" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  vs {kpi.comparison === 'PREVIOUS_MONTH' ? '上月' : kpi.comparison === 'PREVIOUS_WEEK' ? '上周' : kpi.comparison}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 图表区 */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {config.charts.slice(0, 2).map((chart, i) => {
          const isWide = i === 0 && config.charts.length >= 2;
          return (
            <div key={chart.title} className="card" style={{ gridColumn: isWide ? 'span 2' : undefined, overflow: 'hidden' }}>
              <div className="card-header">
                <div className="card-title">{chart.title}</div>
                <span className="chip green">{chart.type}</span>
              </div>
              <div className="card-body">
                <ConfigChartRenderer chart={chart} data={chartData[chart.title] ?? []} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 第二行 — 剩余图表 */}
      {config.charts.length > 2 && (
        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          {config.charts.slice(2, 5).map((chart) => (
            <div key={chart.title} className="card" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <div className="card-title">{chart.title}</div>
                <span className="chip">{chart.type}</span>
              </div>
              <div className="card-body">
                <ConfigChartRenderer chart={chart} data={chartData[chart.title] ?? []} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 洞察列表 */}
      {config.insights && config.insights.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">Agent 主动洞察</div>
            <span className="chip amber">{config.insights.length} 条</span>
          </div>
          <div className="card-body" style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {config.insights.map((insight, i) => {
                const bgMap = {
                  trend_anomaly: 'var(--error-light)',
                  distribution_change: 'var(--warning-light)',
                  opportunity: 'var(--green-lighter)',
                  risk: 'var(--error-light)',
                };
                const borderMap = {
                  trend_anomaly: 'var(--error)',
                  distribution_change: 'var(--warning)',
                  opportunity: 'var(--green)',
                  risk: 'var(--error)',
                };
                const colorMap = {
                  trend_anomaly: 'var(--error-dark)',
                  distribution_change: 'var(--warning)',
                  opportunity: 'var(--green-dark)',
                  risk: 'var(--error-dark)',
                };
                return (
                  <div key={i} style={{
                    padding: 12,
                    background: bgMap[insight.type as keyof typeof bgMap] || 'var(--bg-secondary)',
                    borderRadius: 8,
                    borderLeft: `3px solid ${borderMap[insight.type as keyof typeof borderMap] || 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colorMap[insight.type as keyof typeof colorMap] || 'var(--text-primary)' }}>
                      {insight.type === 'trend_anomaly' ? '⚠' : insight.type === 'risk' ? '🔴' : insight.type === 'opportunity' ? '✦' : '📊'} {insight.description}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {insight.table}.{insight.metric}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 数据库结构概览 — 来自 schemaUnderstanding */}
      {config.kpis.length > 0 && (
        <SchemaOverviewCard datasourceId={datasourceId ?? ''} />
      )}
    </>
  );
}

/* ───────── 图表渲染器 (基于 DashboardConfig 的 ChartSpec + execute 返回的 rows) ───────── */

function ConfigChartRenderer({ chart, data }: { chart: ChartSpec; data: Array<Record<string, unknown>> }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;

    const instance = echarts.init(ref.current);
    const option = buildEChartsOption(chart, data);
    instance.setOption(option);

    const resize = () => instance.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      instance.dispose();
    };
  }, [chart, data]);

  if (data.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>暂无数据</div>;
  }

  return <div ref={ref} style={{ width: '100%', height: 280 }} />;
}

function buildEChartsOption(chart: ChartSpec, data: Array<Record<string, unknown>>): echarts.EChartsOption {
  const type = chart.type || 'bar';

  if (type === 'line') {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: data.map((r) => String(r.time ?? r.name ?? '')),
        axisLabel: { fontSize: 11, color: '#9C968A' },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#9C968A' },
        splitLine: { lineStyle: { color: '#F4F2EC' } },
      },
      series: [{
        type: 'line',
        smooth: true,
        data: data.map((r) => Number(r.value ?? 0)),
        itemStyle: { color: '#5BA888' },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(91,168,136,0.25)' },
            { offset: 1, color: 'rgba(91,168,136,0)' },
          ]),
        },
      }],
    };
  }

  if (type === 'bar') {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: data.map((r) => String(r.name ?? r.time ?? '')),
        axisLabel: { fontSize: 11, color: '#9C968A' },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#9C968A' },
        splitLine: { lineStyle: { color: '#F4F2EC' } },
      },
      series: [{
        type: 'bar',
        data: data.map((r) => Number(r.value ?? 0)),
        itemStyle: { color: '#5BA888', borderRadius: [4, 4, 0, 0] },
        barWidth: 24,
      }],
    };
  }

  if (type === 'pie') {
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: '#6B665C' } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        data: data.map((r) => ({ name: String(r.name ?? ''), value: Number(r.value ?? 0) })),
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12 } },
      }],
    };
  }

  if (type === 'area') {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: data.map((r) => String(r.time ?? r.name ?? '')),
        axisLabel: { fontSize: 11, color: '#9C968A' },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#9C968A' },
        splitLine: { lineStyle: { color: '#F4F2EC' } },
      },
      series: [{
        type: 'line',
        smooth: true,
        data: data.map((r) => Number(r.value ?? 0)),
        itemStyle: { color: '#5BA888' },
        symbol: 'circle',
        symbolSize: 4,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(91,168,136,0.3)' },
            { offset: 1, color: 'rgba(91,168,136,0)' },
          ]),
        },
      }],
    };
  }

  // 默认
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map((r) => String(r.name ?? r.time ?? '')),
    },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: data.map((r) => Number(r.value ?? 0)),
      itemStyle: { color: '#5BA888' },
    }],
  };
}

/* ───────── Schema 概览卡片 ───────── */

function SchemaOverviewCard({ datasourceId }: { datasourceId: string }) {
  const [tables, setTables] = useState<Array<{ name: string; rowCount: number; cols: number; icon: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!datasourceId || loaded) return;
    // 通过 getDashboard 拿到的 config 不含 schema 细节，
    // 这里从 dataSource store 或单独请求获取 schema 概览
    // 暂时用占位：后续如果有 API 再补充
    setLoaded(true);
  }, [datasourceId, loaded]);

  if (tables.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">数据库结构概览 · {tables.length} 张表</div>
      </div>
      <div className="card-body" style={{ padding: 16 }}>
        <div className="grid grid-4" style={{ gap: 12 }}>
          {tables.map((t) => (
            <div
              key={t.name}
              style={{
                padding: 14,
                background: 'var(--bg-secondary)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 22 }}>{t.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span className="num">{t.rowCount.toLocaleString()}</span> 行 · {t.cols} 列
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── 工具函数 ───────── */

function formatValue(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toLocaleString();
}
