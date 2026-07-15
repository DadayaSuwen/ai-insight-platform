# Fix-5 · 紧急修复流程阻断 Bug

> **执行前提**：sprint-5-7 已执行 Fix-1 到 Fix-2，但用户反馈"跑不通"
> **预计耗时**：1 天
> **目标**：修复 12 个阻断完整流程的 bug，让登录 → 配置数据源 → 探索 → 纠错 → 工作台 → 对话全链路跑通

---

## Task 5.0 · 创建验证脚本

### 操作
```bash
mkdir -p docs/implementation/verification
cat > docs/implementation/verification/check-fix-5.sh << 'EOF'
#!/bin/bash
set -e
echo "=== Fix-5 验证 ==="
EOF
chmod +x docs/implementation/verification/check-fix-5.sh
```

---

## Task 5.1 · 【P0】修复 ChatWindow 无路由

### 定位
`apps/web/src/App.tsx`

### 问题
`/` 路由渲染 `HomeRedirect`，ChatWindow 被 `void ChatWindow` 静默。AppShell 侧栏「对话追问」点击跳 `/` → 被重定向到 dashboard → 永远进不了对话页。

### 改什么

**文件**：`apps/web/src/App.tsx`

**1. 删除 `void ChatWindow;` 这一行**（line 75-76 附近）

**2. 新增 chat 路由**：

在路由表中添加：
```tsx
<Route path="/chat/:datasourceId" element={<Shell><ChatWindow /></Shell>} />
```

放在 `/dashboard/:datasourceId` 路由之后。

### 验证
```bash
grep -c "void ChatWindow" apps/web/src/App.tsx
```
输出必须 = 0。

```bash
grep -c "/chat/:datasourceId" apps/web/src/App.tsx
```
输出必须 = 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.1] 检查 ChatWindow 路由..."
COUNT=$(grep -c "void ChatWindow" apps/web/src/App.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: void ChatWindow 仍存在"; exit 1; fi
grep -q "/chat/:datasourceId" apps/web/src/App.tsx || { echo "✗ FAIL: 无 chat 路由"; exit 1; }
echo "  ✓ ChatWindow 路由已添加"
EOF
```

---

## Task 5.2 · 【P0】修复 AppShell 导航跳转到 chat

### 定位
`apps/web/src/components/layout/AppShell.tsx`

### 问题
侧栏「对话追问」`onClick={() => navigate('/')}` + 顶部「提问」按钮 `onClick={() => navigate('/')`，但 `/` 现在是 HomeRedirect 不是 chat。

### 改什么

**文件**：`apps/web/src/components/layout/AppShell.tsx`

**1. 找到所有 `navigate('/')` 调用**（约 2-3 处）

**2. 改为跳转到 chat 路由**：

```tsx
// 侧栏「对话追问」
onClick={() => currentDsId && navigate(`/chat/${currentDsId}`)}

// 顶部「提问」按钮
onClick={() => currentDsId && navigate(`/chat/${currentDsId}`)}
```

如果 `currentDsId` 为空，按钮应 disabled（已有 `disabled={!hasDS}` 逻辑，确认生效）。

### 验证
```bash
grep -c "navigate('/')$\|navigate('/')\b" apps/web/src/components/layout/AppShell.tsx
```
输出应 ≤ 1（仅保留可能的「返回首页」场景，不应是 chat 入口）。

```bash
grep -c "/chat/" apps/web/src/components/layout/AppShell.tsx
```
输出必须 ≥ 2（侧栏 + 顶部按钮）。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.2] 检查 AppShell chat 导航..."
grep -q "/chat/" apps/web/src/components/layout/AppShell.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ AppShell chat 导航已修复"
EOF
```

---

## Task 5.3 · 【P0】修复 SettingsPage 不处理 ?tab= 参数

### 定位
`apps/web/src/features/settings/SettingsPage.tsx`

### 问题
`useState<SettingsTab>('llm')` 写死默认 llm，不读 URL `?tab=` 参数。AppShell 跳 `/settings?tab=datasources` 但页面仍显示 LLM tab。

### 改什么

**文件**：`apps/web/src/features/settings/SettingsPage.tsx`

**1. 引入 useSearchParams**

在文件顶部 import 区添加：
```tsx
import { useSearchParams } from 'react-router-dom';
```

**2. 修改 tab state 初始化**

找到 `const [tab, setTab] = useState<SettingsTab>('llm');`（line 55 附近）

改为：
```tsx
const [searchParams, setSearchParams] = useSearchParams();
const initialTab = (searchParams.get('tab') as SettingsTab) || 'llm';
const [tab, setTab] = useState<SettingsTab>(initialTab);
```

**3. 修改 setTab 调用，同步更新 URL**

找到所有 `setTab(...)` 调用，包装为同步 URL：
```tsx
const handleTabChange = (newTab: SettingsTab) => {
  setTab(newTab);
  setSearchParams({ tab: newTab }, { replace: true });
};
```

把 `onClick={() => setTab(t)}` 改为 `onClick={() => handleTabChange(t)}`。

### 验证
```bash
grep -c "useSearchParams" apps/web/src/features/settings/SettingsPage.tsx
```
输出必须 ≥ 1。

```bash
grep -c "searchParams.get('tab')" apps/web/src/features/settings/SettingsPage.tsx
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.3] 检查 SettingsPage ?tab= 处理..."
grep -q "useSearchParams" apps/web/src/features/settings/SettingsPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "searchParams.get('tab')" apps/web/src/features/settings/SettingsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ SettingsPage ?tab= 已处理"
EOF
```

---

## Task 5.4 · 【P0】修复 ConfirmPage 不调 finalize

### 定位
`apps/web/src/features/schema-review/ConfirmPage.tsx`

### 问题
`handleFinalize` 注释说"简化，直接 navigate"，**根本没调 finalizeReview API**。导致 schemaUnderstanding 未持久化 → dashboard generate 失败。

同时，`finalizeReview(reviewId)` 需要 reviewId，但 ConfirmPage 只从 URL 拿 datasourceId，拿不到 reviewId。

### 改什么

**方案**：用 datasourceStore 传递 reviewId

**1. 扩展 datasource-store**

**文件**：`apps/web/src/core/store/datasource-store.ts`

在 store 中加 `currentReviewId`：
```tsx
interface DatasourceState {
  currentDatasourceId: string | null;
  currentDatasourceName: string | null;
  currentReviewId: string | null;  // 新增
  setCurrent: (id: string, name: string) => void;
  setReviewId: (reviewId: string | null) => void;  // 新增
  clear: () => void;
}

export const useDatasourceStore = create<DatasourceState>((set) => ({
  currentDatasourceId: localStorage.getItem('currentDatasourceId'),
  currentDatasourceName: localStorage.getItem('currentDatasourceName'),
  currentReviewId: localStorage.getItem('currentReviewId'),
  setCurrent: (id, name) => {
    localStorage.setItem('currentDatasourceId', id);
    localStorage.setItem('currentDatasourceName', name);
    set({ currentDatasourceId: id, currentDatasourceName: name });
  },
  setReviewId: (reviewId) => {
    if (reviewId) {
      localStorage.setItem('currentReviewId', reviewId);
    } else {
      localStorage.removeItem('currentReviewId');
    }
    set({ currentReviewId: reviewId });
  },
  clear: () => {
    localStorage.removeItem('currentDatasourceId');
    localStorage.removeItem('currentDatasourceName');
    localStorage.removeItem('currentReviewId');
    set({ currentDatasourceId: null, currentDatasourceName: null, currentReviewId: null });
  },
}));
```

**2. SchemaReviewPage 在 startReview 成功后存 reviewId**

**文件**：`apps/web/src/features/schema-review/hooks/useSchemaReview.ts`

找到 `setReviewId(result.reviewId)`（line 70 附近），同时调 store：
```tsx
setReviewId(result.reviewId);
useDatasourceStore.getState().setReviewId(result.reviewId);
```

**3. ConfirmPage 修复 handleFinalize**

**文件**：`apps/web/src/features/schema-review/ConfirmPage.tsx`

修改 `handleFinalize`：
```tsx
import { useDatasourceStore } from '../../core/store/datasource-store';
import { finalizeReview } from './api';

// 在组件内
const reviewId = useDatasourceStore(s => s.currentReviewId);

const handleFinalize = async () => {
  if (!datasourceId) return;
  setFinalizing(true);
  setError(null);
  try {
    // 调 finalize 持久化 schemaUnderstanding
    if (reviewId) {
      await finalizeReview(reviewId);
    }
    // 清除 reviewId（已用完）
    useDatasourceStore.getState().setReviewId(null);
    // 跳转到 dashboard
    navigate(`/dashboard/${datasourceId}`);
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setFinalizing(false);
  }
};
```

### 验证
```bash
grep -c "currentReviewId" apps/web/src/core/store/datasource-store.ts
```
输出必须 ≥ 3。

```bash
grep -c "finalizeReview" apps/web/src/features/schema-review/ConfirmPage.tsx
```
输出必须 ≥ 1。

```bash
grep -c "setReviewId(result.reviewId)" apps/web/src/features/schema-review/hooks/useSchemaReview.ts
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.4] 检查 ConfirmPage finalize..."
grep -q "currentReviewId" apps/web/src/core/store/datasource-store.ts || { echo "✗ FAIL"; exit 1; }
grep -q "finalizeReview" apps/web/src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConfirmPage finalize 已修复"
EOF
```

---

## Task 5.5 · 【P0】修复 OnboardingPage 死循环

### 定位
`apps/web/src/features/onboarding/OnboardingPage.tsx`

### 问题
有数据源就跳 `/dashboard/:id`，但如果该数据源 `exploreStatus != finalized`，dashboard 报错 → 用户返回 → 又跳 onboarding → 又跳 dashboard → 死循环。

### 改什么

**文件**：`apps/web/src/features/onboarding/OnboardingPage.tsx`

修改 useEffect 逻辑（line 20-40 附近）：

```tsx
useEffect(() => {
  let cancelled = false;
  axiosInstance
    .get<{ success: boolean; data: Array<{ id: string; name: string; exploreStatus: string }> }>(
      '/api/datasources',
    )
    .then((res) => {
      if (cancelled) return;
      const list = res.data.data ?? [];
      if (list.length > 0) {
        // 优先选已 finalized 的数据源
        const finalized = list.find(d => d.exploreStatus === 'finalized');
        const target = finalized || list[0];
        useDatasourceStore.getState().setCurrent(target.id, target.name);
        
        if (target.exploreStatus === 'finalized') {
          // 已敲定 → 跳 dashboard
          navigate(`/dashboard/${target.id}`, { replace: true });
        } else {
          // 未敲定 → 跳 explore 继续探索
          navigate(`/explore/${target.id}`, { replace: true });
        }
        return;
      }
      setChecking(false);
    })
    .catch(() => {
      if (cancelled) return;
      setChecking(false);
    });
  return () => { cancelled = true; };
}, [navigate]);
```

### 验证
```bash
grep -c "exploreStatus === 'finalized'" apps/web/src/features/onboarding/OnboardingPage.tsx
```
输出必须 ≥ 1。

```bash
grep -c "/explore/" apps/web/src/features/onboarding/OnboardingPage.tsx
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.5] 检查 OnboardingPage 死循环修复..."
grep -q "exploreStatus === 'finalized'" apps/web/src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ OnboardingPage 死循环已修复"
EOF
```

---

## Task 5.6 · 【P1】修复 explore 完成后跳转逻辑

### 定位
`apps/web/src/features/explore/ExplorePage.tsx`

### 问题
`done.reviewNeeded=true` 时同时显示「跳 schema-review」和「跳 dashboard」按钮，用户点 dashboard 会因 schemaUnderstanding 未 finalize 报错。

### 改什么

**文件**：`apps/web/src/features/explore/ExplorePage.tsx`

找到 `done.reviewNeeded ? 跳 schema-review : 跳 dashboard` 逻辑（line 122-143 附近）。

修改为：reviewNeeded=true 时只显示「跳 schema-review」按钮，隐藏「跳 dashboard」：

```tsx
{done && !isRunning && (
  <div className="explore-actions">
    {done.reviewNeeded ? (
      <button className="btn btn-primary" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
        查看探索结果，开始确认 →
      </button>
    ) : (
      <button className="btn btn-primary" onClick={() => navigate(`/dashboard/${datasourceId}`)}>
        探索完成，进入工作台 →
      </button>
    )}
  </div>
)}
```

### 验证
```bash
grep -A5 "done.reviewNeeded" apps/web/src/features/explore/ExplorePage.tsx | grep -c "schema-review"
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.6] 检查 explore 跳转逻辑..."
grep -A10 "done.reviewNeeded" apps/web/src/features/explore/ExplorePage.tsx | grep -q "schema-review" || { echo "✗ FAIL"; exit 1; }
echo "  ✓ explore 跳转已修复"
EOF
```

---

## Task 5.7 · 【P1】修复 AppShell 数据源切换器

### 定位
`apps/web/src/components/layout/AppShell.tsx`

### 问题
数据源切换器 onClick 跳 `/settings?tab=datasources`，不调 `useDatasourceStore.setCurrent`。切换数据源后 dashboard/insights/chat 仍用旧 datasourceId。

### 改什么

**文件**：`apps/web/src/components/layout/AppShell.tsx`

**1. 数据源切换器改为下拉列表**

找到 `datasource-switcher` 的 onClick（line 67 附近），改为展开数据源列表：

```tsx
import { useDatasourceStore } from '../core/store/datasource-store';
import axiosInstance from '../../core/api/AxiosInstance';
import { useState, useEffect } from 'react';

// 在组件内
const [dsList, setDsList] = useState<Array<{id: string; name: string}>>([]);
const [showDsList, setShowDsList] = useState(false);
const { currentDatasourceId, currentDatasourceName, setCurrent } = useDatasourceStore();

useEffect(() => {
  axiosInstance.get('/api/datasources').then(res => {
    setDsList(res.data.data || []);
  }).catch(() => {});
}, []);

const handleSwitchDs = (ds: {id: string; name: string}) => {
  setCurrent(ds.id, ds.name);
  setShowDsList(false);
  navigate(`/dashboard/${ds.id}`);
};

// 渲染
<div className="datasource-switcher" onClick={() => setShowDsList(!showDsList)}>
  <div className="datasource-name">
    <span>{currentDatasourceName || '未配置'}</span>
    <ChevronDown size={14} />
  </div>
  <div className="datasource-meta">
    {dsList.length} 个数据源
  </div>
  {showDsList && (
    <div className="ds-dropdown">
      {dsList.map(ds => (
        <div key={ds.id} className="ds-item" onClick={(e) => { e.stopPropagation(); handleSwitchDs(ds); }}>
          {ds.name}
        </div>
      ))}
      <div className="ds-item ds-add" onClick={(e) => { e.stopPropagation(); navigate('/settings?tab=datasources'); }}>
        + 添加新数据源
      </div>
    </div>
  )}
</div>
```

### 验证
```bash
grep -c "setCurrent" apps/web/src/components/layout/AppShell.tsx
```
输出必须 ≥ 1。

```bash
grep -c "dsList\|ds-dropdown" apps/web/src/components/layout/AppShell.tsx
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.7] 检查 AppShell 数据源切换器..."
grep -q "setCurrent" apps/web/src/components/layout/AppShell.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 数据源切换器已修复"
EOF
```

---

## Task 5.8 · 【P1】修复 ChatWindow 拿 datasourceId

### 定位
`apps/web/src/features/chat/components/ChatWindow.tsx`

### 问题
ChatWindow 没有从 useParams/useDatasourceStore 拿 datasourceId，即使加了路由也不知道用哪个数据源。

### 改什么

**文件**：`apps/web/src/features/chat/components/ChatWindow.tsx`

**1. 在组件顶部拿 datasourceId**

```tsx
import { useParams } from 'react-router-dom';
import { useDatasourceStore } from '../../../core/store/datasource-store';

// 在组件函数内
const { datasourceId: urlDsId } = useParams<{ datasourceId: string }>();
const storeDsId = useDatasourceStore(s => s.currentDatasourceId);
const datasourceId = urlDsId || storeDsId || '';
```

**2. 把 datasourceId 传给 chat API 调用**

找到所有 chat API 调用（`sendMessage` / `useSSEChat` / `chatSessionApi` 等），确认它们接收 datasourceId 参数。

如果现有 API 不接收，需要改 API 层：
```tsx
// useSSEChat.ts
const url = `${API_BASE}/api/chat/stream?message=${msg}&sessionId=${sessionId}&dataSourceId=${datasourceId}`;
```

**3. 创建 session 时传 datasourceId**

```tsx
const session = await chatSessionApi.create({ dataSourceId: datasourceId });
```

### 验证
```bash
grep -c "datasourceId" apps/web/src/features/chat/components/ChatWindow.tsx
```
输出必须 ≥ 3。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.8] 检查 ChatWindow datasourceId..."
COUNT=$(grep -c "datasourceId" apps/web/src/features/chat/components/ChatWindow.tsx)
if [ "$COUNT" -lt 3 ]; then echo "✗ FAIL: datasourceId 处理不足"; exit 1; fi
echo "  ✓ ChatWindow datasourceId 已接入"
EOF
```

---

## Task 5.9 · 【P1】修复 DashboardPage 未 finalize 时的引导

### 定位
`apps/web/src/features/dashboard/DashboardPage.tsx`

### 问题
未 finalize 时 schemaUnderstanding 是 null，dashboard 显示空表概览，无引导。

### 改什么

**文件**：`apps/web/src/features/dashboard/DashboardPage.tsx`

在 useDashboard hook 中检测 exploreStatus，未 finalized 时显示引导：

```tsx
const { config, loading, error, regenerate } = useDashboard(datasourceId);
const [dsStatus, setDsStatus] = useState<string>('');

useEffect(() => {
  axiosInstance.get(`/api/datasources/${datasourceId}`).then(res => {
    setDsStatus(res.data.data?.exploreStatus || 'unknown');
  }).catch(() => {});
}, [datasourceId]);

if (dsStatus && dsStatus !== 'finalized') {
  return (
    <div className="empty-state">
      <h2>数据源尚未完成 Schema 确认</h2>
      <p>当前状态: {dsStatus}</p>
      <button onClick={() => navigate(`/explore/${datasourceId}`)}>
        {dsStatus === 'pending' || dsStatus === 'exploring' ? '查看探索进度' : '去确认 Schema'}
      </button>
    </div>
  );
}
```

### 验证
```bash
grep -c "exploreStatus" apps/web/src/features/dashboard/DashboardPage.tsx
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.9] 检查 DashboardPage 未 finalize 引导..."
grep -q "exploreStatus" apps/web/src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DashboardPage 引导已添加"
EOF
```

---

## Task 5.10 · 【P2】后端 insights range 参数校验

### 定位
`apps/server/src/modules/insights/insight.controller.ts`

### 改什么

找到 `ListQuerySchema` 定义，加 range enum：

```typescript
const ListQuerySchema = z.object({
  datasourceId: z.string().optional(),
  range: z.enum(['today', 'week', 'month', 'all']).optional().default('all'),
});
```

### 验证
```bash
grep -c "z.enum.*today.*week.*month" apps/server/src/modules/insights/insight.controller.ts
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.10] 检查 insights range 校验..."
grep -q "z.enum" apps/server/src/modules/insights/insight.controller.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ insights range 已校验"
EOF
```

---

## Task 5.11 · 【P2】dashboard execute metric 白名单放宽

### 定位
`apps/server/src/modules/dashboard-generator/generator.controller.ts`

### 改什么

找到 `SAFE_METRIC` 正则（line 60 附近）：

```typescript
// 修改前
const SAFE_METRIC = /^[A-Za-z_][A-Za-z0-9_]*$/;

// 修改后：允许中文 + 空格 + 常见聚合
const SAFE_METRIC = /^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5\s]*$/;
```

### 验证
```bash
grep -c "u4e00-u9fa5" apps/server/src/modules/dashboard-generator/generator.controller.ts
```
输出必须 ≥ 1。

### 更新 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo "[Task 5.11] 检查 metric 白名单..."
grep -q "u4e00" apps/server/src/modules/dashboard-generator/generator.controller.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ metric 白名单已放宽"
EOF
```

---

## Task 5.12 · 最终验证

### 完善 check-fix-5.sh
```bash
cat >> docs/implementation/verification/check-fix-5.sh << 'EOF'

echo ""
echo "[最终检查] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
pnpm lint > /dev/null 2>&1 || { echo "✗ FAIL: lint"; exit 1; }
echo "  ✓ 全量编译通过"

echo ""
echo "====================================="
echo "✓ Fix-5 验证全部通过"
echo "====================================="
EOF
```

### 验证
```bash
bash docs/implementation/verification/check-fix-5.sh
```

输出必须以 `✓ Fix-5 验证全部通过` 结尾。

---

## Fix-5 完成标准

✅ Task 5.1: ChatWindow 加 `/chat/:datasourceId` 路由
✅ Task 5.2: AppShell 导航跳 `/chat/:id`
✅ Task 5.3: SettingsPage 读 `?tab=` 参数
✅ Task 5.4: ConfirmPage 调 finalizeReview（通过 store 传 reviewId）
✅ Task 5.5: OnboardingPage 按 exploreStatus 智能跳转
✅ Task 5.6: explore reviewNeeded=true 时隐藏 dashboard 按钮
✅ Task 5.7: AppShell 数据源切换器调 setCurrent
✅ Task 5.8: ChatWindow 拿 datasourceId 传给 API
✅ Task 5.9: DashboardPage 未 finalize 时引导
✅ Task 5.10: insights range enum 校验
✅ Task 5.11: dashboard metric 白名单放宽

## 修复后的完整流程

```
登录 → onboarding（无数据源时）
  → 点「连接数据库」→ /settings?tab=datasources
  → 配置数据源 → 跳 /explore/:id
  → 探索完成
    ├ reviewNeeded=true → 跳 /schema-review/:id
    │  → startReview → 存 reviewId 到 store
    │  → 对话纠错 → 跳 /confirm/:id
    │  → 调 finalizeReview(reviewId) → 跳 /dashboard/:id
    └ reviewNeeded=false → 跳 /dashboard/:id
  → 工作台显示真实 KPI + ECharts
  → 侧栏「对话追问」→ /chat/:id → ChatWindow 用 datasourceId
  → 侧栏「主动洞察」→ /insights/:id → 真实洞察列表
```

---
*AI生成*
