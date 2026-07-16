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
import { getDatasourceSchema, type SchemaUnderstanding } from '../schema-review/api';
import { useDatasourceStore } from '../../core/store/datasource-store';
import { toast } from '../../store/toast';

export default function DashboardPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();

  const { config, loading, error, regenerate } = useDashboard(datasourceId);
  const datasourceName = useDatasourceStore((s) => s.currentDatasourceName);

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
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--green)' }} />
        <p className="text-sm text-muted">Agent 正在生成工作台...</p>
      </div>
    );
  }

  /* ─── 错误态 ─── */
  if (error) {
    return (
      <div className="p-10 text-center">
        <p className="text-error mb-4">{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId}`)}>
          返回探索
        </button>
      </div>
    );
  }

  if (!config) return null;

  const dsName = datasourceName || datasourceId?.slice(0, 8) || '数据源';

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
        className="mb-6 px-4 py-3 rounded-lg text-sm flex items-center gap-2.5"
        style={{
          background: 'var(--green-lighter)',
          borderLeft: '3px solid var(--green)',
          color: 'var(--green-darker)',
        }}
      >
        <span>✦</span>
        <span>Agent 基于敲定的 Schema 自动生成了 {config.kpis.length} 个 KPI 卡片和 {config.charts.length} 个图表。如需调整维度或图表类型，在对话页直接告诉 Agent。</span>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-5 mb-6">
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
                <div className="kpi-delta text-xs text-muted mt-1">
                  vs {kpi.comparison === 'PREVIOUS_MONTH' ? '上月' : kpi.comparison === 'PREVIOUS_WEEK' ? '上周' : kpi.comparison}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 图表区 */}
      <div className="grid grid-3 mb-6">
        {config.charts.slice(0, 2).map((chart, i) => {
          const isWide = i === 0 && config.charts.length >= 2;
          return (
            <div key={chart.title} className="card overflow-hidden" style={{ gridColumn: isWide ? 'span 2' : undefined }}>
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
        <div className="grid grid-3 mb-6">
          {config.charts.slice(2, 5).map((chart) => (
            <div key={chart.title} className="card overflow-hidden">
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

      {/* 数据库结构概览 — 点击表名可对话分析 */}
      {datasourceId && (
        <SchemaOverviewCard datasourceId={datasourceId} onAnalyzeTable={(table) => navigate(`/chat/${datasourceId}`)} />
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
    return <div className="p-10 text-center text-muted text-sm">暂无数据</div>;
  }

  return <div ref={ref} className="w-full" style={{ height: 280 }} />;
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

function SchemaOverviewCard({
  datasourceId,
  onAnalyzeTable,
}: {
  datasourceId: string;
  onAnalyzeTable?: (tableName: string) => void;
}) {
  const [schema, setSchema] = useState<SchemaUnderstanding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!datasourceId) return;
    let cancelled = false;
    setLoading(true);
    getDatasourceSchema(datasourceId)
      .then((res) => {
        if (!cancelled) {
          setSchema(res.schemaUnderstanding);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasourceId]);

  if (loading) {
    return (
      <div className="card overflow-hidden mb-6">
        <div className="card-header">
          <div className="card-title">数据库结构概览</div>
        </div>
        <div className="card-body p-4">
          <div className="text-sm text-muted">加载中...</div>
        </div>
      </div>
    );
  }

  const tables = schema?.tables ?? [];
  if (tables.length === 0) return null;

  return (
    <div className="card overflow-hidden mb-6">
      <div className="card-header">
        <div className="card-title">🗄️ 数据库结构概览 · {tables.length} 张表</div>
        <span className="chip green">点击表名可对话分析</span>
      </div>
      <div className="card-body p-4">
        <div className="grid grid-4 gap-3">
          {tables.map((t) => {
            const measureCount = t.columns.filter(
              (c) => c.semanticRole === "measure",
            ).length;
            const dimCount = t.columns.filter(
              (c) =>
                c.semanticRole === "dimension" || c.semanticRole === "time",
            ).length;
            return (
              <button
                key={t.name}
                className="p-3.5 bg-muted rounded-xl border border-default text-left hover:border-green hover:bg-[var(--green-lighter)] transition-colors cursor-pointer"
                onClick={() => onAnalyzeTable?.(t.name)}
                title={`点击分析 ${t.name} 表`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {t.name}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {t.columns.length} 字段
                    {measureCount > 0 && <> · {measureCount} 指标</>}
                    {dimCount > 0 && <> · {dimCount} 维度</>}
                    {t.rowCount != null && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="num">
                          {t.rowCount.toLocaleString()}
                        </span>{" "}
                        行
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
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
