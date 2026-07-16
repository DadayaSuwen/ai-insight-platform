# Fix-10 · Dashboard + Chat + Insights 联调

> **执行前提**：Fix-9 已完成（explore → schema-review → confirm 链路通）
> **目标**：DashboardPage / ChatWindow / InsightsPage 删除 mock，接入真实后端 API
> **方法**：3 个页面都有现成的 api.ts + hook，只需要把 mock 替换为真实调用

---

## Task 10.1 · DashboardPage 接入真实 API

### Bug
`DashboardPage.tsx` 注释明确写 `Mock 数据 + ECharts 真实渲染图表, 不调 /api/dashboard/execute`。
- KPI 用 `KPI_DATA` 硬编码数组
- 图表用 `ORDER_TREND` / `CHANNEL_PIE` 硬编码
- 表列表用 `TABLES` 硬编码 8 张表
- `void useDatasourceStore` 把 store 静默了

但 `api.ts` 已有 `generateDashboard` / `getDashboard` / `executeDashboard` 三个函数。

### 定位
`apps/web/src/features/dashboard/DashboardPage.tsx`

### 改什么

**1. 删除所有 mock 常量**

删除 `KPI_DATA`、`ORDER_TREND`、`CHANNEL_PIE`、`TABLES` 四个硬编码数组。

**2. 引入真实 API + state**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as echarts from 'echarts';
import { useDatasourceStore } from '../../core/store/datasource-store';
import { generateDashboard, getDashboard, executeDashboard, type DashboardConfig, type KpiSpec, type ChartSpec } from './api';
import { toast } from '../../store/toast';

export default function DashboardPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpiValues, setKpiValues] = useState<Record<string, number>>({});
  const [chartData, setChartData] = useState<Record<string, any[]>>({});

  // 加载工作台配置
  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    
    // 先尝试 GET 已有的，404 则 POST generate
    getDashboard(datasourceId)
      .then(cfg => {
        setConfig(cfg);
        setLoading(false);
        // 加载 KPI + 图表数据
        loadKpiValues(cfg.kpis);
        loadChartData(cfg.charts);
      })
      .catch(() => {
        // 没有已生成的 → 调 generate
        generateDashboard(datasourceId)
          .then(cfg => {
            setConfig(cfg);
            setLoading(false);
            loadKpiValues(cfg.kpis);
            loadChartData(cfg.charts);
          })
          .catch(err => {
            setError(err.message);
            setLoading(false);
          });
      });
  }, [datasourceId]);

  // 加载每个 KPI 的真实值
  const loadKpiValues = async (kpis: KpiSpec[]) => {
    for (const kpi of kpis) {
      try {
        const result = await executeDashboard({
          datasourceId: datasourceId!,
          table: kpi.table,
          metric: kpi.metric,
          filter: kpi.filter,
        });
        if (result.rows.length > 0) {
          setKpiValues(prev => ({ ...prev, [kpi.label]: result.rows[0].value as number }));
        }
      } catch (err) {
        console.warn(`KPI ${kpi.label} 加载失败`, err);
      }
    }
  };

  // 加载每个图表的真实数据
  const loadChartData = async (charts: ChartSpec[]) => {
    for (const chart of charts) {
      try {
        const result = await executeDashboard({
          datasourceId: datasourceId!,
          table: chart.table,
          metric: chart.metric,
          groupBy: chart.groupBy,
          timeField: chart.timeField,
          range: chart.range || '30d',
        });
        setChartData(prev => ({ ...prev, [chart.title]: result.rows }));
      } catch (err) {
        console.warn(`图表 ${chart.title} 加载失败`, err);
      }
    }
  };

  // 刷新（重新 generate）
  const handleRefresh = () => {
    if (!datasourceId) return;
    setLoading(true);
    generateDashboard(datasourceId)
      .then(cfg => {
        setConfig(cfg);
        setLoading(false);
        loadKpiValues(cfg.kpis);
        loadChartData(cfg.charts);
        toast.success('工作台已刷新');
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };
```

**3. 渲染真实 KPI 卡片**

```tsx
{config?.kpis.map((kpi, i) => {
  const value = kpiValues[kpi.label];
  return (
    <div key={i} className={`kpi-card ${kpi.icon?.includes('💰') ? 'amber' : kpi.icon?.includes('👥') ? 'info' : ''}`}>
      <div className="kpi-label">{kpi.icon} {kpi.label}</div>
      <div className="kpi-value">
        {value !== undefined ? formatValue(value) : '加载中...'}
      </div>
    </div>
  );
})}
```

**4. 渲染真实 ECharts 图表**

```tsx
{config?.charts.map((chart, i) => (
  <div key={i} className="card">
    <div className="card-header">
      <div className="card-title">{chart.title}</div>
      <span className="chip">{chart.type}</span>
    </div>
    <div className="card-body">
      <ChartRenderer chart={chart} data={chartData[chart.title] || []} />
    </div>
  </div>
))}

// ChartRenderer 组件
function ChartRenderer({ chart, data }: { chart: ChartSpec; data: any[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    
    const instance = echarts.init(chartRef.current);
    const option = buildEChartsOption(chart, data);
    instance.setOption(option);
    
    return () => instance.dispose();
  }, [chart, data]);
  
  return <div ref={chartRef} style={{ width: '100%', height: 280 }} />;
}

function buildEChartsOption(chart: ChartSpec, data: any[]): echarts.EChartsOption {
  if (chart.type === 'line' || chart.type === 'bar') {
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: data.map(r => r.time || r.name) },
      yAxis: { type: 'value' },
      series: [{ type: chart.type, data: data.map(r => r.value) }],
    };
  }
  if (chart.type === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        data: data.map(r => ({ name: r.name, value: r.value })),
      }],
    };
  }
  return {};
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toLocaleString();
}
```

**5. 删除 `void useDatasourceStore`**

改为真正使用 store（如果需要）或删除。

### 验证
```bash
grep -c "const KPI_DATA\|const ORDER_TREND\|const CHANNEL_PIE\|const TABLES" apps/web/src/features/dashboard/DashboardPage.tsx
# 应该 = 0

grep -c "generateDashboard\|getDashboard\|executeDashboard" apps/web/src/features/dashboard/DashboardPage.tsx
# 应该 ≥ 3
```

---

## Task 10.2 · ChatWindow 接入真实 SSE

### Bug
`ChatWindow.tsx` 注释写 `Mock 数据 + 内嵌 inline styles, 不调 SSE`。
- 对话内容用 `MOCK_RESULT_ROWS` 硬编码
- 不调 `useSSEChat` hook

但 `useSSEChat` hook 已存在且实现了真实 SSE。

### 定位
`apps/web/src/features/chat/components/ChatWindow.tsx`

### 改什么

**1. 删除 mock 数据**

删除 `MOCK_RESULT_ROWS` 和所有硬编码对话内容。

**2. 引入 useSSEChat + useChatActions**

```tsx
import { useSSEChat } from '../hooks';
import { useChatActions } from '../hooks/useChatActions';
import { chatSessionApi } from '../api';
import { useChatStore } from '../store';
import { recordToChatMessage } from '../utils/recordToChatMessage';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { useDatasourceStore } from '../../../core/store/datasource-store';

export default function ChatWindow() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const urlDsId = useDatasourceStore(s => s.currentDatasourceId);
  const dsId = datasourceId || urlDsId || '';
  
  const messages = useChatStore(s => s.messages);
  const isLoading = useChatStore(s => s.isLoading);
  const error = useChatStore(s => s.error);
  
  const { sendInCurrentSession, loadSessions } = useChatActions();
  const { sendMessage, abort } = useSSEChat({
    onText: (data) => {
      useChatStore.getState().updateLastAssistant(msg => ({ ...msg, content: msg.content + data.content }));
    },
    onToolCall: (data) => {
      useChatStore.getState().updateLastAssistant(msg => ({ ...msg, toolCalls: [...(msg.toolCalls ?? []), data] }));
    },
    onToolResult: (data) => {
      useChatStore.getState().updateLastAssistant(msg => ({ ...msg, toolResults: [...(msg.toolResults ?? []), data] }));
    },
    onError: (data) => {
      useChatStore.getState().updateLastAssistant(msg => ({ ...msg, error: { code: data.code, message: data.message } }));
    },
    onDone: () => {
      useChatStore.getState().updateLastAssistant(msg => ({ ...msg, isFinal: true }));
    },
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    await sendInCurrentSession(text, { sendMessage, abort, newId: () => crypto.randomUUID() });
    setInput('');
  };
```

**3. 渲染真实消息列表**

```tsx
{/* 中间对话主区 */}
<div className="chat-main">
  <div className="chat-header">
    <button onClick={() => navigate(`/dashboard/${dsId}`)}>
      ← 返回工作台
    </button>
    <span className="badge badge-success">● Schema 已确认</span>
  </div>
  
  <div className="chat-messages">
    {messages.length === 0 ? (
      <div className="empty-state">
        <p>基于已确认的 Schema，问任何问题...</p>
      </div>
    ) : (
      messages.map(m => (
        <MessageBubble key={m.id} message={m} onSuggestionClick={handleSend} />
      ))
    )}
    <div ref={messagesEndRef} />
  </div>
  
  <ChatInput onSend={handleSend} onStop={abort} isLoading={isLoading} />
</div>
```

**4. 保留三栏布局（左推荐 + 中对话 + 右上下文）**

左栏推荐提问可以保留硬编码（不是核心），但点击后调 `handleSend(query)`。
右栏上下文面板显示真实的 Token / 工具调用 / 耗时（从 last assistant message 的 metadata 读）。

### 验证
```bash
grep -c "MOCK_RESULT_ROWS" apps/web/src/features/chat/components/ChatWindow.tsx
# 应该 = 0

grep -c "useSSEChat\|sendMessage\|useChatStore" apps/web/src/features/chat/components/ChatWindow.tsx
# 应该 ≥ 3
```

---

## Task 10.3 · InsightsPage 接入真实 API

### Bug
`InsightsPage.tsx` 注释写 `Mock: 3 条硬编码洞察 + 巡检状态卡, 不调 /api/insights`。
但 `api.ts` 已有 `insightsApi.list` / `dismiss` / `shield`。

### 定位
`apps/web/src/features/insights/InsightsPage.tsx`

### 改什么

**1. 删除 mock 数据**

删除 `INSIGHTS` 硬编码数组。

**2. 引入真实 API**

```tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { insightsApi, type Insight } from './api';

export default function InsightsPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    insightsApi.list(datasourceId, range)
      .then(data => {
        setInsights(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [datasourceId, range]);

  const handleDismiss = async (id: string) => {
    try {
      await insightsApi.dismiss(id);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleShield = async (id: string) => {
    try {
      await insightsApi.shield(id);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error(err);
    }
  };
```

**3. 渲染真实洞察**

```tsx
{loading ? (
  <div className="loading">加载洞察中...</div>
) : insights.length === 0 ? (
  <div className="empty-state">
    <p>暂无洞察</p>
    <p>Agent 会在每日巡检时自动发现异常与机会</p>
  </div>
) : (
  insights.map(insight => {
    const severityConfig = {
      high: { color: 'var(--error)', bg: 'var(--error-light)', emoji: '🔴' },
      medium: { color: 'var(--warning)', bg: 'var(--warning-light)', emoji: '⚠️' },
      low: { color: 'var(--green-dark)', bg: 'var(--green-lighter)', emoji: '💡' },
    };
    const cfg = severityConfig[insight.severity as keyof typeof severityConfig] || severityConfig.medium;
    
    return (
      <div key={insight.id} className="card">
        <div className="card-header" style={{ background: cfg.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{cfg.emoji}</span>
            <div>
              <div className="card-title" style={{ color: cfg.color }}>{insight.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {insight.type} · 严重度 {insight.severity} · 置信度 {(insight.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(insight.id)}>标记已处理</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleShield(insight.id)}>屏蔽此类</button>
          </div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 12px' }}>{insight.description}</p>
          
          {/* 探索过程 */}
          {insight.evidence?.explorationSteps && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>🔍 Agent 探索过程</div>
              {insight.evidence.explorationSteps.map((step: string, i: number) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: 1.7 }}>
                  {step}
                </div>
              ))}
            </div>
          )}
          
          {/* 建议 */}
          {insight.suggestion && (
            <div style={{ background: 'var(--green-lighter)', borderLeft: '3px solid var(--green)', borderRadius: 6, padding: '10px 14px', fontSize: 12 }}>
              <strong style={{ color: 'var(--green-darker)' }}>💡 Agent 建议：</strong>
              <span>{insight.suggestion}</span>
            </div>
          )}
        </div>
        <div className="card-footer">
          发现时间：{new Date(insight.detectedAt).toLocaleString('zh-CN')}
        </div>
      </div>
    );
  })
)}
```

### 验证
```bash
grep -c "const INSIGHTS" apps/web/src/features/insights/InsightsPage.tsx
# 应该 = 0

grep -c "insightsApi" apps/web/src/features/insights/InsightsPage.tsx
# 应该 ≥ 2
```

---

## Task 10.4 · 修复后端 dashboard generate 持久化

### Bug
`generator.service.ts` 的 `generate()` 方法是否真的持久化 config 到 `schemaUnderstanding.dashboard`？

### 定位
`apps/server/src/modules/dashboard-generator/generator.service.ts`

### 改什么

读取 `generate` 方法末尾，确认有持久化逻辑：

```bash
grep -A10 "understanding.dashboard" apps/server/src/modules/dashboard-generator/generator.service.ts
```

**如果没有持久化**，在 `return config` 前加：

```typescript
// 持久化到 schemaUnderstanding.dashboard
const persistedUnderstanding = (record.schemaUnderstanding as Record<string, unknown>) ?? {};
persistedUnderstanding.dashboard = config;

await this.db.db
  .updateTable('DataSource')
  .set({ schemaUnderstanding: persistedUnderstanding as any })
  .where('id', '=', datasourceId)
  .execute();
```

### 验证
```bash
grep -c "understanding.dashboard = config\|persistedUnderstanding.dashboard" apps/server/src/modules/dashboard-generator/generator.service.ts
# 应该 ≥ 1
```

---

## Task 10.5 · 修复后端 insights scheduler 定时触发

### Bug
insights 模块有 `InsightSchedulerService`（定时巡检），但需要确认：
1. cron 是否真的注册了？
2. 巡检时是否真的调 InsightAgent？
3. 巡检结果是否持久化到 Insight 表？

### 定位
`apps/server/src/modules/insights/insight-scheduler.service.ts`

### 改什么

**1. 确认 cron 注册**

```bash
grep -n "cron.schedule\|onModuleInit" apps/server/src/modules/insights/insight-scheduler.service.ts
```

**2. 确认 InsightAgent 被调用**

```bash
grep -n "insightAgent.generate" apps/server/src/modules/insights/insight-scheduler.service.ts
```

**3. 确认持久化**

```bash
grep -n "persistInsight\|insertInto.*Insight" apps/server/src/modules/insights/insight-scheduler.service.ts
```

如果以上都有 ✓，无需改动。如果缺失，按 Fix-1 Task 1.6/1.7 补齐。

### 验证
```bash
grep -c "cron.schedule" apps/server/src/modules/insights/insight-scheduler.service.ts
# 应该 ≥ 1

grep -c "insightAgent.generate" apps/server/src/modules/insights/insight-scheduler.service.ts
# 应该 ≥ 1
```

---

## Task 10.6 · 最终验证脚本

### 创建 check-fix-10.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-10 Dashboard+Chat+Insights 联调验证 ==="

echo "[10.1] DashboardPage 接入 API..."
COUNT=$(grep -c "const KPI_DATA\|const ORDER_TREND\|const CHANNEL_PIE" apps/web/src/features/dashboard/DashboardPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock 数据"; exit 1; fi
grep -q "generateDashboard\|getDashboard\|executeDashboard" apps/web/src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DashboardPage 已接入 API"

echo "[10.2] ChatWindow 接入 SSE..."
COUNT=$(grep -c "MOCK_RESULT_ROWS" apps/web/src/features/chat/components/ChatWindow.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "useSSEChat\|sendMessage" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ChatWindow 已接入 SSE"

echo "[10.3] InsightsPage 接入 API..."
COUNT=$(grep -c "const INSIGHTS" apps/web/src/features/insights/InsightsPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "insightsApi" apps/web/src/features/insights/InsightsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ InsightsPage 已接入 API"

echo "[10.4] 后端 dashboard 持久化..."
grep -q "understanding.dashboard\|persistedUnderstanding.dashboard" apps/server/src/modules/dashboard-generator/generator.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ dashboard 持久化已实现"

echo "[10.5] insights scheduler..."
grep -q "cron.schedule" apps/server/src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL"; exit 1; }
grep -q "insightAgent.generate" apps/server/src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ insights scheduler 已接入"

echo ""
echo "[最终] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-10 验证全部通过"
echo "====================================="
```

### 验证
```bash
bash docs/implementation/verification/check-fix-10.sh
```

---

## Fix-10 完成标准

✅ Task 10.1: DashboardPage 删除 mock，调 generateDashboard + getDashboard + executeDashboard
✅ Task 10.2: ChatWindow 删除 mock，接入 useSSEChat + useChatActions
✅ Task 10.3: InsightsPage 删除 mock，调 insightsApi.list + dismiss + shield
✅ Task 10.4: 后端 dashboard generate 持久化 config
✅ Task 10.5: insights scheduler cron + InsightAgent + 持久化

## 修复后的完整产品流程

```
登录 → onboarding → 连接数据源 → explore 5步 → schema-review 纠错 → confirm 敲定

→ DashboardPage
  - GET /api/dashboard/:dsId → 拿到 config（kpis + charts + insights）
  - 404 → POST /api/dashboard/generate → LLM 生成 config → 持久化
  - 每个 KPI 调 POST /api/dashboard/execute → 真实数值
  - 每个图表调 POST /api/dashboard/execute → 真实数据 → ECharts 渲染

→ ChatWindow
  - 用户输入 → POST /api/chat/stream (SSE)
  - PlannerAgent 接收 → bindTools → ReAct 循环
  - 工具调用 → query_details / gen_chart / generate_insight
  - 流式 token 输出 → 前端逐字渲染
  - 工具结果 → 前端渲染图表/表格/洞察

→ InsightsPage
  - GET /api/insights?datasourceId=xxx → 真实洞察列表
  - 每条洞察含 title/description/evidence/suggestion
  - 标记已处理 → POST /api/insights/:id/dismiss
  - 屏蔽此类 → POST /api/insights/:id/shield
  - 每日 8:00 cron 自动巡检 → InsightAgent.generate → 持久化新洞察
```

## ⚠️ 本地验证步骤

```bash
# 1. 启动项目
pnpm db:up && pnpm db:seed
pnpm dev:server && pnpm dev:web

# 2. 登录 → 配置 LLM → 连接数据源 → explore → schema-review → confirm

# 3. 验证 DashboardPage
#    - 应显示真实的 KPI 数值（不是 48,237 等硬编码）
#    - 应显示真实的 ECharts 图表（基于你的数据库数据）
#    - 点「刷新」应重新 generate

# 4. 验证 ChatWindow
#    - 输入问题 → 应触发真实 SSE 流
#    - 应看到工具调用过程（query_details / gen_chart）
#    - 应看到真实图表/表格渲染

# 5. 验证 InsightsPage
#    - 首次访问可能为空（还没有巡检）
#    - 手动触发：POST /api/insights/run-now?datasourceId=xxx
#    - 刷新页面应显示真实洞察
```

---
*AI生成*
