/**
 * [Fix-7 Task 7.10] 工作台页 — 1:1 还原原型 PAGES.dashboard (pages.js)
 *
 * Mock 数据 + ECharts 真实渲染图表, 不调 /api/dashboard/execute
 */
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, RefreshCw, MessageSquare, Edit3 } from 'lucide-react';
import * as echarts from 'echarts';
import { useDatasourceStore } from '../../core/store/datasource-store';

/* ───────── Mock 数据 ───────── */
const KPI_DATA = [
  { label: '总订单数', value: '48,237', unit: '单', delta: '+12.4%', trend: 'up', accent: 'green' },
  { label: '总销售额', value: '¥8.42M', unit: '', delta: '+18.7%', trend: 'up', accent: 'green' },
  { label: '客户数', value: '3,248', unit: '', delta: '+5.2%', trend: 'up', accent: 'info' },
  { label: '客单价', value: '¥174.5', unit: '', delta: '-2.3%', trend: 'down', accent: 'amber' },
  { label: '复购率', value: '38.6%', unit: '', delta: '+3.1pp', trend: 'up', accent: 'green' },
];

const ORDER_TREND = {
  months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月'],
  orders: [4200, 4800, 5400, 6100, 6800, 7400, 8200],
  revenue: [820, 920, 1100, 1280, 1420, 1560, 1740],
};

const CHANNEL_PIE = [
  { name: 'Web', value: 18420 },
  { name: 'App', value: 15832 },
  { name: '小程序', value: 9145 },
  { name: 'H5', value: 4840 },
];

const TABLES = [
  { name: 'orders', rows: 48237, cols: 12, icon: '📋' },
  { name: 'order_items', rows: 98432, cols: 7, icon: '📦' },
  { name: 'customers', rows: 3248, cols: 9, icon: '👥' },
  { name: 'products', rows: 486, cols: 11, icon: '🛍️' },
  { name: 'payments', rows: 45821, cols: 9, icon: '💰' },
  { name: 'shipping', rows: 12847, cols: 10, icon: '🚚' },
  { name: 'categories', rows: 24, cols: 4, icon: '🏷️' },
  { name: 'reviews', rows: 8234, cols: 6, icon: '⭐' },
];

export default function DashboardPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  // [Fix-7] Mock: 跳过大数据源状态检测 (Fix-5 加的引导逻辑)
  void useDatasourceStore;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">工作台 · {datasourceId === 'mock' ? 'ecommerce_db' : (datasourceId ?? '数据源')}</h1>
          <p className="page-subtitle">Agent 基于 Schema 理解自动生成 · 5 KPI · 3 图表</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm">
            <RefreshCw size={14} /> 刷新
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/schema-review/${datasourceId ?? 'ds_001'}`)}>
            <Edit3 size={14} /> 修订 Schema
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/chat/${datasourceId ?? 'ds_001'}`)}>
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
        <span>Agent 基于敲定的 Schema 自动生成了 5 个 KPI 卡片和 3 个图表。如需调整维度或图表类型,在对话页直接告诉 Agent。</span>
      </div>

      {/* 5 个 KPI */}
      <div className="grid grid-5" style={{ marginBottom: 24 }}>
        {KPI_DATA.map((k) => (
          <div key={k.label} className={`kpi-card ${k.accent === 'amber' ? 'amber' : k.accent === 'info' ? 'info' : ''}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">
              {k.value}
              {k.unit && <span className="kpi-unit">{k.unit}</span>}
            </div>
            <div className={`kpi-delta ${k.trend}`}>
              {k.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{k.delta}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>vs 上月</span>
            </div>
          </div>
        ))}
      </div>

      {/* 图表区 */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="card" style={{ gridColumn: 'span 2', overflow: 'hidden' }}>
          <div className="card-header">
            <div className="card-title">订单量与销售额趋势</div>
            <span className="chip green">最近 7 个月</span>
          </div>
          <div className="card-body">
            <OrderTrendChart />
          </div>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div className="card-title">订单渠道分布</div>
            <span className="chip">本季度</span>
          </div>
          <div className="card-body">
            <ChannelPieChart />
          </div>
        </div>
      </div>

      {/* 第二行 - 客户/订单状态/主动洞察 */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <CustomerTierCard />
        <OrderStatusFlowCard />
        <InsightHighlightCard />
      </div>

      {/* 数据库结构概览 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">数据库结构概览 · 8 张表</div>
          <span className="chip green">12,847 总字段</span>
        </div>
        <div className="card-body" style={{ padding: 16 }}>
          <div className="grid grid-4" style={{ gap: 12 }}>
            {TABLES.map((t) => (
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
                    <span className="num">{t.rows.toLocaleString()}</span> 行 · {t.cols} 列
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────── 图表组件 (ECharts 真实渲染) ───────── */

function OrderTrendChart() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      grid: { left: 50, right: 20, top: 30, bottom: 30 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['订单量 (单)', '销售额 (千元)'], right: 0, top: 0, textStyle: { fontSize: 12 } },
      xAxis: { type: 'category', data: ORDER_TREND.months, axisLine: { lineStyle: { color: '#E5DFD2' } }, axisLabel: { fontSize: 11, color: '#9C968A' } },
      yAxis: [
        { type: 'value', name: '订单量', position: 'left', axisLine: { show: false }, axisLabel: { fontSize: 11, color: '#9C968A' }, splitLine: { lineStyle: { color: '#F4F2EC' } } },
        { type: 'value', name: '销售额', position: 'right', axisLine: { show: false }, axisLabel: { fontSize: 11, color: '#9C968A', formatter: '¥{value}' }, splitLine: { show: false } },
      ],
      series: [
        {
          name: '订单量 (单)',
          type: 'line',
          smooth: true,
          data: ORDER_TREND.orders,
          itemStyle: { color: '#5BA888' },
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(91,168,136,0.25)' },
            { offset: 1, color: 'rgba(91,168,136,0)' },
          ]) },
        },
        {
          name: '销售额 (千元)',
          type: 'bar',
          yAxisIndex: 1,
          data: ORDER_TREND.revenue,
          itemStyle: { color: '#D4A06D', borderRadius: [4, 4, 0, 0] },
          barWidth: 16,
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, []);
  return <div ref={ref} className="chart-container lg" />;
}

function ChannelPieChart() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: '#6B665C' } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        data: CHANNEL_PIE.map((d) => ({ ...d, itemStyle: { color: ['#5BA888', '#4A8E73', '#D4A06D', '#6B95B8'][CHANNEL_PIE.indexOf(d)] } })),
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12 } },
      }],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, []);
  return <div ref={ref} className="chart-container" />;
}

function CustomerTierCard() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['新客户', '普通', '银牌', '金牌', 'VIP'], axisLabel: { fontSize: 11, color: '#9C968A' } },
      yAxis: { axisLabel: { fontSize: 11, color: '#9C968A' }, splitLine: { lineStyle: { color: '#F4F2EC' } } },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      series: [{
        type: 'bar',
        data: [624, 1284, 812, 384, 144],
        itemStyle: { color: '#5BA888', borderRadius: [4, 4, 0, 0] },
        barWidth: 24,
      }],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, []);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-header"><div className="card-title">客户等级分布</div></div>
      <div className="card-body" style={{ padding: 16 }}>
        <div ref={ref} className="chart-container sm" />
      </div>
    </div>
  );
}

function OrderStatusFlowCard() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-header"><div className="card-title">订单状态流转</div></div>
      <div className="card-body" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
          {[
            { name: '待付款', count: 1242, color: 'var(--warning)' },
            { name: '已付款', count: 3421, color: 'var(--info)' },
            { name: '已发货', count: 5821, color: 'var(--green)' },
            { name: '已签收', count: 32451, color: 'var(--green-dark)' },
            { name: '已取消', count: 3284, color: 'var(--text-muted)' },
            { name: '已退款', count: 3018, color: 'var(--error)' },
          ].map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1, color: 'var(--text-secondary)' }}>{s.name}</div>
              <div className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsightHighlightCard() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-header">
        <div className="card-title">Agent 主动洞察</div>
        <span className="chip amber">3 条</span>
      </div>
      <div className="card-body" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 12, background: 'var(--error-light)', borderRadius: 8, borderLeft: '3px solid var(--error)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-dark)' }}>⚠ 客单价下降 2.3%</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>小程序的客单价持续走低</div>
          </div>
          <div style={{ padding: 12, background: 'var(--warning-light)', borderRadius: 8, borderLeft: '3px solid var(--warning)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)' }}>⚠ App 取消率上升</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>iOS 新版发布后取消率 +5pp</div>
          </div>
          <div style={{ padding: 12, background: 'var(--green-lighter)', borderRadius: 8, borderLeft: '3px solid var(--green)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-dark)' }}>✦ VIP 复购提升</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>5 月 VIP 复购率 +8pp</div>
          </div>
        </div>
      </div>
    </div>
  );
}
