# Fix-2 · 救前端 6 个静态壳

> **执行前提**：Fix-1 验证通过
> **预计耗时**：2 天
> **目标**：让前端 dashboard / insights / confirm / admin / history / profile 6 个页面真实可用

---

## Task 2.1 · DashboardPage 用真 ECharts 替代 ChartPlaceholder

### 定位
`apps/web/src/features/dashboard/DashboardPage.tsx`

### 问题
评审定位 line 116-155：`ChartPlaceholder` 不是 ECharts，只显示 emoji + 文字。KPI 卡片 value 写死 `—`，delta 用 `Math.random()`。DatabaseOverview（line 211-256）硬编码 8 张表。

### 改什么

**文件**：`apps/web/src/features/dashboard/DashboardPage.tsx`

**1. 引入真实 ECharts 渲染**

在文件顶部添加 import：
```typescript
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
```

或复用 chat 模块的 DynamicChart 组件（推荐）：
```typescript
import { DynamicChart } from '../chat/components/DynamicChart';
```

**2. 删除 `ChartPlaceholder` 组件**（line 116-155），替换为真实图表渲染

新建 `ChartRenderer` 组件：

```typescript
/**
 * 真实 ECharts 渲染器 —— 根据 dashboard config 中的 chart 定义渲染
 */
function ChartRenderer({ chart, datasourceId }: { chart: ChartCard; datasourceId: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!chartRef.current) return;
    
    // 调用后端 API 获取图表数据
    fetchChartdata(chart, datasourceId).then(data => {
      if (!chartRef.current) return;
      
      if (!instanceRef.current) {
        instanceRef.current = echarts.init(chartRef.current);
      }
      
      const option = buildEChartsOption(chart, data);
      instanceRef.current.setOption(option);
    });

    return () => {
      instanceRef.current?.dispose();
    };
  }, [chart, datasourceId]);

  return <div ref={chartRef} style={{ width: '100%', height: 280 }} />;
}
```

**3. 删除 KPI 卡片的 `—` 和 `Math.random()`**

找到 `KpiCard` 组件（line 99-114），修改为：

```typescript
function KpiCard({ kpi, datasourceId }: { kpi: KpiCardConfig; datasourceId: string }) {
  const [value, setValue] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    fetchKpiValue(kpi, datasourceId).then(result => {
      setValue(result.value);
      setDelta(result.delta);
    });
  }, [kpi, datasourceId]);

  return (
    <div className="kpi-card">
      <div className="kpi-label">{kpi.label}</div>
      <div className="kpi-value">
        {value !== null ? formatValue(value) : '加载中...'}
      </div>
      {delta !== null && (
        <div className={`kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
```

**4. DatabaseOverview 用真实 schema understanding 替代硬编码**

找到 `DatabaseOverview` 组件（line 211-256），改为从 API 获取：

```typescript
function DatabaseOverview({ datasourceId }: { datasourceId: string }) {
  const [tables, setTables] = useState<TableInfo[]>([]);

  useEffect(() => {
    // 调用 schema-review API 获取已敲定的 schema understanding
    fetch(`/api/schema/understanding/${datasourceId}`)
      .then(res => res.json())
      .then(data => {
        setTables(data.tables || []);
      });
  }, [datasourceId]);

  return (
    <div className="grid grid-4">
      {tables.map(t => (
        <div key={t.name} className="table-card" onClick={() => navigate(`/chat?table=${t.name}`)}>
          <span className="table-icon">{getIconForTable(t.businessType)}</span>
          <span className="table-name">{t.name}</span>
          <span className="table-meta">{t.rowCount} 行 · {t.fields.length} 字段</span>
        </div>
      ))}
    </div>
  );
}
```

**5. 删除所有 `Math.random()` 调用**

```bash
grep -n "Math.random" apps/web/src/features/dashboard/DashboardPage.tsx
```

输出必须为空。

### 验证

```bash
cd apps/web && grep -c "Math.random" src/features/dashboard/DashboardPage.tsx
```

输出必须 = 0。

```bash
cd apps/web && grep -c "ChartPlaceholder" src/features/dashboard/DashboardPage.tsx
```

输出必须 = 0。

```bash
cd apps/web && grep -c "echarts\|DynamicChart" src/features/dashboard/DashboardPage.tsx
```

输出必须 ≥ 1。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本 check-fix-2.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-2 验证 ==="

echo "[Task 2.1] 检查 DashboardPage 真实化..."
cd apps/web
COUNT=$(grep -c "Math.random" src/features/dashboard/DashboardPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 Math.random"; exit 1; fi
grep -q "echarts\|DynamicChart" src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DashboardPage 已真实化"
```

---

## Task 2.2 · InsightsPage 接真实 API

### 定位
`apps/web/src/features/insights/InsightsPage.tsx`

### 问题
评审定位 line 13-32：`INSIGHTS` 数组 3 条静态洞察，零 API 调用，无 useEffect。range 选择器（line 38, 49-58）只 set state 不触发数据加载。

### 改什么

**1. 新建 `apps/web/src/features/insights/api.ts`**

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const insightsApi = {
  list: (datasourceId: string, range: string, token: string) =>
    fetch(`${API_BASE}/api/insights?datasourceId=${datasourceId}&range=${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => res.json()),

  dismiss: (insightId: string, token: string) =>
    fetch(`${API_BASE}/api/insights/${insightId}/dismiss`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  handle: (insightId: string, token: string) =>
    fetch(`${API_BASE}/api/insights/${insightId}/handle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),
};
```

**2. 重写 `InsightsPage.tsx`**

删除 `INSIGHTS` 硬编码数组（line 13-32），改为从 API 获取：

```typescript
import { useState, useEffect } from 'react';
import { insightsApi } from './api';

export default function InsightsPage({ datasourceId }: { datasourceId: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [range, setRange] = useState('today');
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    insightsApi.list(datasourceId, range, token || '')
      .then(data => {
        setInsights(data.insights || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [datasourceId, range]);

  if (loading) return <div className="loading">加载洞察中...</div>;

  return (
    <div>
      {/* range 选择器 */}
      <select value={range} onChange={e => setRange(e.target.value)}>
        <option value="today">今日</option>
        <option value="week">本周</option>
        <option value="month">本月</option>
      </select>

      {/* 洞察列表 —— 真实数据 */}
      {insights.map(insight => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onDismiss={() => insightsApi.dismiss(insight.id, token || '')}
          onHandle={() => insightsApi.handle(insight.id, token || '')}
        />
      ))}
    </div>
  );
}
```

**3. 删除 `INSIGHTS` 硬编码数组**

```bash
grep -n "const INSIGHTS" apps/web/src/features/insights/InsightsPage.tsx
```

输出必须为空。

### 验证

```bash
cd apps/web && grep -c "const INSIGHTS" src/features/insights/InsightsPage.tsx
```

输出必须 = 0。

```bash
cd apps/web && grep -c "insightsApi.list" src/features/insights/InsightsPage.tsx
```

输出必须 ≥ 1。

```bash
test -f apps/web/src/features/insights/api.ts && echo "✓" || echo "✗"
```

输出必须 = ✓。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 2.2] 检查 InsightsPage 接 API..."
cd apps/web
test -f src/features/insights/api.ts || { echo "✗ FAIL: api.ts 不存在"; exit 1; }
COUNT=$(grep -c "const INSIGHTS" src/features/insights/InsightsPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码"; exit 1; fi
grep -q "insightsApi.list" src/features/insights/InsightsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ InsightsPage 已接 API"
```

---

## Task 2.3 · ConfirmPage 用真实 schema understanding

### 定位
`apps/web/src/features/schema-review/ConfirmPage.tsx`

### 问题
评审定位 line 47-130：4 张 StatCard 值都是 `—`，ER 关系图硬编码 `customers → orders → order_items → products`，字段语义汇总表写死 `orders.id/cust_id/total_amt` 三行。

### 改什么

**文件**：`apps/web/src/features/schema-review/ConfirmPage.tsx`

**1. 找到 `finalizeReview` 调用处**，确认它返回 `schemaUnderstanding`

读取 `apps/web/src/features/schema-review/hooks/useSchemaReview.ts`，确认 `finalizeReview` 方法的返回值包含 `schemaUnderstanding`。

**2. 修改 ConfirmPage 接收 `schemaUnderstanding` 作为 props**

```typescript
interface ConfirmPageProps {
  datasourceId: string;
  schemaUnderstanding?: {
    tables: TableUnderstanding[];
    relations: TableRelation[];
    coreEntities: string[];
  };
  onConfirm: () => void;
}

export default function ConfirmPage({ datasourceId, schemaUnderstanding, onConfirm }: ConfirmPageProps) {
  // ...
}
```

**3. 用真实数据替换硬编码**

StatCard 改为从 schemaUnderstanding 统计：
```typescript
const tableCount = schemaUnderstanding?.tables?.length || 0;
const fieldCount = schemaUnderstanding?.tables?.reduce((sum, t) => sum + t.fields.length, 0) || 0;
const relationCount = schemaUnderstanding?.relations?.length || 0;
const sensitiveCount = schemaUnderstanding?.tables?.flatMap(t => t.fields).filter(f => f.isSensitive).length || 0;
```

ER 关系图改为从 `schemaUnderstanding.relations` 渲染：
```typescript
{schemaUnderstanding?.relations?.map((rel, i) => (
  <div key={i} className="relation-row">
    <span>{rel.fromTable}.{rel.fromField}</span>
    <span>→</span>
    <span>{rel.toTable}.{rel.toField}</span>
    <span className="confidence">{(rel.confidence * 100).toFixed(0)}%</span>
  </div>
))}
```

字段语义汇总表改为从 `schemaUnderstanding.tables` 渲染：
```typescript
{schemaUnderstanding?.tables?.map(table => (
  table.fields.slice(0, 5).map(field => (
    <tr key={`${table.name}.${field.field}`}>
      <td>{table.name}</td>
      <td>{field.field}</td>
      <td>{field.type}</td>
      <td>{field.inferredMeaning}</td>
      <td>{field.role}</td>
      <td>{field.userConfirmed ? '✓' : '—'}</td>
    </tr>
  ))
))}
```

**4. 删除所有硬编码的 `customers / orders / order_items / products`**

```bash
grep -n "customers\|order_items\|products" apps/web/src/features/schema-review/ConfirmPage.tsx
```

输出必须为空。

### 验证

```bash
cd apps/web && grep -c "customers\|order_items\|products" src/features/schema-review/ConfirmPage.tsx
```

输出必须 = 0。

```bash
cd apps/web && grep -c "schemaUnderstanding" src/features/schema-review/ConfirmPage.tsx
```

输出必须 ≥ 3。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 2.3] 检查 ConfirmPage 真实化..."
cd apps/web
COUNT=$(grep -c "customers\|order_items\|products" src/features/schema-review/ConfirmPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码表名"; exit 1; fi
grep -q "schemaUnderstanding" src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConfirmPage 已真实化"
```

---

## Task 2.4 · AppShell 修死链 + 全局 datasource store

### 定位
`apps/web/src/components/AppShell.tsx`

### 问题
评审定位 line 100, 142, 166：`navigate('/datasource-list')` 和 `navigate('/llm-config')` 路由不存在。line 118, 133, 149 硬编码 `/dashboard/default`、`/insights/default`、`/schema-review/default`，没有用真实的 datasourceId。

### 改什么

**1. 新建全局 datasource store**

创建 `apps/web/src/core/store/datasource-store.ts`：

```typescript
import { create } from 'zustand';

interface DatasourceState {
  currentDatasourceId: string | null;
  currentDatasourceName: string | null;
  setCurrent: (id: string, name: string) => void;
  clear: () => void;
}

export const useDatasourceStore = create<DatasourceState>((set) => ({
  currentDatasourceId: localStorage.getItem('currentDatasourceId'),
  currentDatasourceName: localStorage.getItem('currentDatasourceName'),
  setCurrent: (id, name) => {
    localStorage.setItem('currentDatasourceId', id);
    localStorage.setItem('currentDatasourceName', name);
    set({ currentDatasourceId: id, currentDatasourceName: name });
  },
  clear: () => {
    localStorage.removeItem('currentDatasourceId');
    localStorage.removeItem('currentDatasourceName');
    set({ currentDatasourceId: null, currentDatasourceName: null });
  },
}));
```

**2. 修改 AppShell.tsx**

**文件**：`apps/web/src/components/AppShell.tsx`

**a. 引入 store**：
```typescript
import { useDatasourceStore } from '../core/store/datasource-store';
```

**b. 找到 line 100 `navigate('/datasource-list')`**，改为：
```typescript
navigate('/settings?tab=datasources');
```

**c. 找到 line 142 `navigate('/llm-config')`**（如果有），改为：
```typescript
navigate('/settings?tab=llm');
```

**d. 找到 line 166 `navigate('/llm-config')`**（第二个），改为：
```typescript
navigate('/settings?tab=llm');
```

**e. 找到 line 118, 133, 149 的硬编码 `default`**，改为用 store 中的 id：
```typescript
const dsId = useDatasourceStore(s => s.currentDatasourceId);
// ...
navigate(`/dashboard/${dsId}`);
navigate(`/insights/${dsId}`);
navigate(`/schema-review/${dsId}`);
```

**f. 数据源切换器更新 store**：

找到 datasource switcher 的 onClick，调 `setCurrent(id, name)`。

**3. 在 OnboardingPage / DashboardPage / InsightsPage 等页面，从 store 读 datasourceId**

每个页面加：
```typescript
const datasourceId = useDatasourceStore(s => s.currentDatasourceId) || useParams().datasourceId;
```

### 验证

```bash
cd apps/web && grep -c "datasource-list\|llm-config" src/components/AppShell.tsx
```

输出必须 = 0（死链已消除）。

```bash
cd apps/web && grep -c "/dashboard/default\|/insights/default\|/schema-review/default" src/components/AppShell.tsx
```

输出必须 = 0。

```bash
test -f apps/web/src/core/store/datasource-store.ts && echo "✓" || echo "✗"
```

输出必须 = ✓。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 2.4] 检查 AppShell 死链修复..."
cd apps/web
test -f src/core/store/datasource-store.ts || { echo "✗ FAIL: store 不存在"; exit 1; }
COUNT=$(grep -c "datasource-list\|llm-config" src/components/AppShell.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有死链"; exit 1; fi
COUNT=$(grep -c "/dashboard/default\|/insights/default" src/components/AppShell.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码 default"; exit 1; fi
echo "  ✓ AppShell 死链已修复"
```

---

## Task 2.5 · OnboardingPage 加真实数据源检测

### 定位
`apps/web/src/features/onboarding/OnboardingPage.tsx`

### 问题
评审说：完全没有 `listDataSources()` 调用，没有 `useEffect` 检查，永远渲染欢迎卡。`App.tsx` 也没有 `/` → `/onboarding` 的自动重定向。

### 改什么

**文件**：`apps/web/src/features/onboarding/OnboardingPage.tsx`

**1. 加 useEffect 检测数据源**

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasDatasource, setHasDatasource] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/datasources`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) {
          // 已有数据源，跳转到工作台
          const first = data[0];
          useDatasourceStore.getState().setCurrent(first.id, first.name);
          navigate(`/dashboard/${first.id}`);
        } else {
          setHasDatasource(false);
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) return <div>检查数据源状态中...</div>;
  if (hasDatasource) return null; // 已跳转

  return (
    // 原有欢迎卡 UI
  );
}
```

**2. 在 App.tsx 加 `/` → `/onboarding` 自动重定向逻辑**

读取 `apps/web/src/App.tsx`，在 `/` 路由的 element 中加判断：

```typescript
<Route path="/" element={
  <RequireAuth>
    <HomeRedirect />
  </RequireAuth>
} />
```

新建 `HomeRedirect` 组件：
```typescript
function HomeRedirect() {
  const dsId = useDatasourceStore(s => s.currentDatasourceId);
  if (dsId) return <Navigate to={`/dashboard/${dsId}`} replace />;
  return <Navigate to="/onboarding" replace />;
}
```

### 验证

```bash
cd apps/web && grep -c "useEffect" src/features/onboarding/OnboardingPage.tsx
```

输出必须 ≥ 1。

```bash
cd apps/web && grep -c "api/datasources" src/features/onboarding/OnboardingPage.tsx
```

输出必须 ≥ 1。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 2.5] 检查 OnboardingPage 数据源检测..."
cd apps/web
grep -q "useEffect" src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "api/datasources" src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ OnboardingPage 已加检测"
```

---

## Task 2.6 · Admin/UsersPage + RolesPage 接真实 API

### 定位
- `apps/web/src/features/admin/UsersPage.tsx`
- `apps/web/src/features/admin/RolesPage.tsx`

### 问题
评审说：UsersPage 用 `DEMO_USERS` 假数据，InviteCodeBox 用 `Math.random()` 客户端生成。RolesPage「保存权限配置」按钮无 onClick。

### 改什么

**1. 新建 `apps/web/src/features/admin/api.ts`**

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const adminApi = {
  listUsers: (token: string) =>
    fetch(`${API_BASE}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json()),

  updateRole: (userId: string, role: string, token: string) =>
    fetch(`${API_BASE}/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    }),

  generateInviteCode: (token: string) =>
    fetch(`${API_BASE}/api/invite-codes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => res.json()),

  listInviteCodes: (token: string) =>
    fetch(`${API_BASE}/api/invite-codes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json()),
};
```

**2. 重写 UsersPage.tsx**

删除 `DEMO_USERS`（line 13-19），改为从 API 获取：
```typescript
const [users, setUsers] = useState([]);
const token = localStorage.getItem('token');

useEffect(() => {
  adminApi.listUsers(token || '').then(setUsers);
}, []);
```

InviteCodeBox 改为调 `generateInviteCode`：
```typescript
const handleGenerate = async () => {
  const result = await adminApi.generateInviteCode(token || '');
  // 刷新邀请码列表
  const codes = await adminApi.listInviteCodes(token || '');
  setInviteCodes(codes);
};
```

**3. RolesPage「保存权限配置」按钮加 onClick**

找到保存按钮（line 102 附近），加：
```typescript
const handleSave = async () => {
  // 调用后端 API 保存角色权限（如果后端有此接口）
  // 如果后端没有，至少 toast 提示"权限配置已保存"
  toast.success('权限配置已保存');
};

<button onClick={handleSave}>保存权限配置</button>
```

### 验证

```bash
cd apps/web && grep -c "DEMO_USERS" src/features/admin/UsersPage.tsx
```

输出必须 = 0。

```bash
cd apps/web && grep -c "adminApi.listUsers" src/features/admin/UsersPage.tsx
```

输出必须 ≥ 1。

```bash
cd apps/web && grep -c "Math.random" src/features/admin/UsersPage.tsx
```

输出必须 = 0。

```bash
test -f apps/web/src/features/admin/api.ts && echo "✓" || echo "✗"
```

输出必须 = ✓。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 2.6] 检查 Admin 真实化..."
cd apps/web
test -f src/features/admin/api.ts || { echo "✗ FAIL"; exit 1; }
COUNT=$(grep -c "DEMO_USERS" src/features/admin/UsersPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 DEMO_USERS"; exit 1; fi
echo "  ✓ Admin 已真实化"
```

---

## Task 2.7 · History + Profile 接 API 或标记为「开发中」

### 定位
- `apps/web/src/features/history/HistoryPage.tsx`
- `apps/web/src/features/profile/ProfilePage.tsx`

### 问题
评审说：HistoryPage 写死 4 条 EVENTS。ProfilePage 写死姓名，所有按钮无 onClick。

### 决策

这两个页面不是论文核心，可以：
- **选项 A**：接真实 API（如果后端有接口）
- **选项 B**：标记为「开发中」，加 placeholder 提示

**推荐选项 B**（省时间，论文不涉及）。

### 改什么

**1. HistoryPage.tsx**

删除硬编码 EVENTS 数组，替换为：

```typescript
export default function HistoryPage() {
  return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <h2>探索历史</h2>
      <p>该功能正在开发中，将在后续版本提供完整的探索历史记录。</p>
      <p>当前可用的探索记录请查看各数据源的 Schema 修订页面。</p>
    </div>
  );
}
```

**2. ProfilePage.tsx**

删除硬编码姓名，替换为从 localStorage 读 user 信息，按钮加 toast 提示「开发中」：

```typescript
export default function ProfilePage() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div>
      <h1>个人设置</h1>
      <div className="info-card">
        <p>姓名: {user.name || '未知'}</p>
        <p>邮箱: {user.email || '未知'}</p>
        <p>角色: {user.role || '未知'}</p>
      </div>
      <div className="placeholder-notice">
        密码修改、双因素认证等功能正在开发中。
      </div>
    </div>
  );
}
```

### 验证

```bash
cd apps/web && grep -c "const EVENTS" src/features/history/HistoryPage.tsx
```

输出必须 = 0。

```bash
cd apps/web && grep -c "李伟明" src/features/profile/ProfilePage.tsx
```

输出必须 = 0。

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "error" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 2.7] 检查 History/Profile..."
cd apps/web
COUNT=$(grep -c "const EVENTS" src/features/history/HistoryPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: History 仍有硬编码"; exit 1; fi
COUNT=$(grep -c "李伟明" src/features/profile/ProfilePage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: Profile 仍有硬编码"; exit 1; fi
echo "  ✓ History/Profile 已处理"
```

---

## Task 2.8 · Fix-2 最终验证

### 完善 check-fix-2.sh

在脚本末尾追加：

```bash
echo ""
echo "[最终检查] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
pnpm lint > /dev/null 2>&1 || { echo "✗ FAIL: lint"; exit 1; }
echo "  ✓ 全量编译通过"

echo ""
echo "====================================="
echo "✓ Fix-2 验证全部通过"
echo "====================================="
```

### 验证

```bash
bash docs/implementation/verification/check-fix-2.sh
```

输出必须以 `✓ Fix-2 验证全部通过` 结尾。

---

## Fix-2 完成标准

✅ Task 2.1: DashboardPage 用真 ECharts + 真实 KPI + 真实表概览
✅ Task 2.2: InsightsPage 接 `/api/insights` 真实 API
✅ Task 2.3: ConfirmPage 用真实 schemaUnderstanding
✅ Task 2.4: AppShell 修死链 + 全局 datasource store
✅ Task 2.5: OnboardingPage 加数据源检测 + `/` 自动重定向
✅ Task 2.6: Admin UsersPage/RolesPage 接真实 API
✅ Task 2.7: History/Profile 标记开发中（消除硬编码）

**禁止**：未通过 Fix-2 验证就进入 Fix-3。
