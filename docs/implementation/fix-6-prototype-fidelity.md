# Fix-6 · 严格按原型还原 3 个核心页面

> **执行前提**：Fix-5 已完成，流程跑通
> **预计耗时**：2 天
> **目标**：探索页动态化 + 设置页拆分 + 对话页适配 AppShell，严格还原原型视觉

---

## Task 6.1 · 探索页动态化 — 后端 SSE 推送细粒度数据

### 定位
`apps/server/src/modules/schema-explorer/explore.service.ts`

### 问题
后端 SSE 只推 `step` + `detail`（一句话），没推"发现的表列表"和"字段推断过程"。前端无法展示原型那样的逐表/逐字段滚动效果。

### 改什么

**文件**：`apps/server/src/modules/schema-explorer/explore.service.ts`

在 `explore()` 方法的每一步中，增加 `progress` 事件推送细粒度数据：

**1. 第 2 步（发现表）推送表列表**

找到第 2 步 `discover_tables` 的 yield（搜索 `discover_tables`），在 done 事件前加：

```typescript
// 推送发现的每张表（前端逐行渲染）
for (const table of rawSchema.tables) {
  yield this.sseEvent('progress', {
    step: 2,
    type: 'table_discovered',
    data: {
      name: table.name,
      rowCount: table.rowCount,
      columnCount: table.columns.length,
      size: table.size,
    },
  });
}
```

**2. 第 3 步（字段语义）推送字段推断结果**

找到第 3 步 `analyze_fields` 的循环（遍历 columns 的地方），每分析完一个字段就推送：

```typescript
for (const col of table.columns) {
  const confidence = this.semanticInference.computeConfidence(col);
  const needsConfirm = confidence < 0.85;
  
  // 推送每个字段的推断结果（前端逐行渲染）
  yield this.sseEvent('progress', {
    step: 3,
    type: 'field_analyzed',
    data: {
      table: table.name,
      field: col.name,
      type: col.type,
      inferredMeaning: col.chineseName || col.name,
      role: col.semanticRole || 'unknown',
      confidence: parseFloat(confidence.toFixed(2)),
      needsConfirmation: needsConfirm,
      status: needsConfirm ? 'pending' : 'confirmed',
    },
  });
}
```

**3. 第 4 步（表关系）推送关系推断**

```typescript
for (const relation of understanding.relations) {
  yield this.sseEvent('progress', {
    step: 4,
    type: 'relation_inferred',
    data: relation,
  });
}
```

### 验证
```bash
grep -c "sseEvent.*progress" apps/server/src/modules/schema-explorer/explore.service.ts
```
输出必须 ≥ 3（3 种 progress 事件）。

---

## Task 6.2 · 探索页动态化 — 前端渲染细粒度数据

### 定位
`apps/web/src/features/explore/hooks/useSSEExplore.ts` + `apps/web/src/features/explore/ExplorePage.tsx`

### 改什么

**1. 扩展 useSSEExplore hook，收集 progress 事件**

**文件**：`apps/web/src/features/explore/hooks/useSSEExplore.ts`

在 state 中加 `progressItems`：
```typescript
interface ProgressItem {
  step: number;
  type: 'table_discovered' | 'field_analyzed' | 'relation_inferred';
  data: any;
  timestamp: string;
}

interface ExploreState {
  steps: ExploreStep[];
  progressItems: ProgressItem[];  // 新增
  done: DoneInfo | null;
  error: string | null;
  isRunning: boolean;
  logs: string[];
}
```

在 SSE 处理中加 `progress` 事件分支：
```typescript
if (eventData.type === 'progress') {
  set({ progressItems: [...get().progressItems, eventData] });
  return;
}
```

**2. ExplorePage 渲染 progressItems**

**文件**：`apps/web/src/features/explore/ExplorePage.tsx`

在每个 StepRow 内，渲染该步骤对应的 progressItems：

```tsx
function StepRow({ step, progressItems }: { step: ExploreStep; progressItems: ProgressItem[] }) {
  const stepProgress = progressItems.filter(p => p.step === step.step);
  
  return (
    <div className={`explore-step ${stepState}`}>
      <div className="explore-step-icon">...</div>
      <div style={{ flex: 1 }}>
        <div className="explore-step-title">{STEP_LABELS[step.step]}</div>
        {step.detail && <div className="explore-step-desc">{step.detail}</div>}
        
        {/* 渲染该步骤的细粒度进度 */}
        {stepProgress.length > 0 && (
          <div className="explore-step-detail">
            {stepProgress.map((p, i) => {
              if (p.type === 'table_discovered') {
                return (
                  <div key={i} className="progress-line table-line">
                    <span style={{ color: 'var(--green-dark)' }}>▸</span>{' '}
                    <strong>{p.data.name}</strong> ({p.data.rowCount.toLocaleString()} 行 · {p.data.columnCount} 列)
                  </div>
                );
              }
              if (p.type === 'field_analyzed') {
                const color = p.data.needsConfirmation ? 'var(--amber)' : 'var(--green-dark)';
                const icon = p.data.needsConfirmation ? '⏳' : '✓';
                return (
                  <div key={i} className="progress-line field-line" style={{ color }}>
                    {icon} {p.data.table}.{p.data.field} → {p.data.inferredMeaning} ({p.data.role}, 置信度 {p.data.confidence})
                  </div>
                );
              }
              if (p.type === 'relation_inferred') {
                return (
                  <div key={i} className="progress-line relation-line">
                    <span style={{ color: 'var(--green-dark)' }}>→</span>{' '}
                    {p.data.fromTable}.{p.data.fromField} → {p.data.toTable}.{p.data.toField}
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

**3. 加 CSS 动画**（逐行滚入效果）

在 `apps/web/src/index.css` 追加：
```css
.progress-line {
  animation: slideIn 0.3s ease-out;
}
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
```

### 验证
```bash
grep -c "progressItems" apps/web/src/features/explore/hooks/useSSEExplore.ts
```
输出必须 ≥ 3。

```bash
grep -c "table_discovered\|field_analyzed" apps/web/src/features/explore/ExplorePage.tsx
```
输出必须 ≥ 2。

---

## Task 6.3 · 设置页拆分 — LLM 配置独立页面

### 定位
- 新建 `apps/web/src/features/llm-config/LlmConfigPage.tsx`
- 修改 `apps/web/src/App.tsx` 加路由
- 修改 `apps/web/src/components/layout/AppShell.tsx` 侧栏入口

### 问题
原型中 LLM 配置是侧栏「管理」区的独立入口，实际被杂糅在 SettingsPage 的 tab 里。

### 改什么

**1. 新建 `apps/web/src/features/llm-config/LlmConfigPage.tsx`**

把 `SettingsPage.tsx` 中 `tab === 'llm'` 分支的所有内容**移动**到这个新文件：

```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../../core/store';
import type { LLMConfig } from '@workspace/types';
import { LLMProvider } from '@workspace/types';
import { toast } from '../../store/toast';

// 把 SettingsPage 中 LLM 相关的 const、interface、组件逻辑全部搬过来
const PROVIDER_LABELS: Record<LLMProvider, string> = { ... };
const DEFAULT_MODELS: Record<LLMProvider, string> = { ... };
const BASE_URLS: Record<LLMProvider, string> = { ... };

export default function LlmConfigPage() {
  // 把 SettingsPage 中 LLM 配置的 useState/useEffect/handleSave 全部搬过来
  // 渲染独立的 LLM 配置页面（不要 tab，不要 DataSourcesTab）
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">模型配置</h1>
          <p className="page-subtitle">配置 LLM API Key 与模型选择 · 仅管理员可见</p>
        </div>
        <span className="badge badge-warning">管理员专属</span>
      </div>
      
      {/* Provider 选择卡片 */}
      {/* API Key / Base URL / Model / Temperature 表单 */}
      {/* 测试连接按钮 */}
      {/* 安全提示 */}
    </div>
  );
}
```

**2. 新建 `apps/web/src/features/llm-config/index.ts`**

```typescript
export { default as LlmConfigPage } from './LlmConfigPage';
```

**3. App.tsx 加路由**

```tsx
import { LlmConfigPage } from './features/llm-config';

<Route path="/llm-config" element={<Shell><LlmConfigPage /></Shell>} />
```

**4. AppShell 侧栏「模型配置」改为跳 `/llm-config`**

找到侧栏管理区「模型配置」的 onClick：
```tsx
// 修改前
onClick={() => navigate('/settings?tab=llm')}

// 修改后
onClick={() => navigate('/llm-config')}
```

### 验证
```bash
test -f apps/web/src/features/llm-config/LlmConfigPage.tsx && echo "✓" || echo "✗"
```
输出必须 = ✓。

```bash
grep -c "/llm-config" apps/web/src/App.tsx
```
输出必须 ≥ 1。

```bash
grep -c "navigate.*llm-config" apps/web/src/components/layout/AppShell.tsx
```
输出必须 ≥ 1。

---

## Task 6.4 · 设置页拆分 — 数据源管理独立页面

### 定位
- 新建 `apps/web/src/features/datasources/DatasourcesPage.tsx`
- 修改路由 + 侧栏

### 改什么

**1. 新建 `apps/web/src/features/datasources/DatasourcesPage.tsx`**

```tsx
import DataSourcesTab from './DataSourcesTab';

export default function DatasourcesPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">数据源管理</h1>
          <p className="page-subtitle">管理所有已连接的数据源 · 支持数据库与 CSV 文件</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm">上传 CSV</button>
          <button className="btn btn-primary btn-sm">连接数据库</button>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-4">
        {/* 数据源总数 / 数据库 / CSV / 表总数 */}
      </div>
      
      {/* 数据源列表表格 */}
      <DataSourcesTab />
    </div>
  );
}
```

**2. App.tsx 加路由**

```tsx
import { DatasourcesPage } from './features/datasources';

<Route path="/datasources" element={<Shell><DatasourcesPage /></Shell>} />
```

**3. AppShell 侧栏「数据源管理」改为跳 `/datasources`**

```tsx
// 修改前
onClick={() => navigate('/settings?tab=datasources')}

// 修改后
onClick={() => navigate('/datasources')}
```

**4. 数据源切换器「添加新数据源」也跳 `/datasources`**

```tsx
// AppShell.tsx 数据源下拉
onClick={() => navigate('/datasources')}
```

**5. 删除或简化 SettingsPage**

SettingsPage 不再需要 tab，可以：
- 选项 A：删除 SettingsPage（如果它没有其他设置项）
- 选项 B：保留但改为「通用设置」页（主题、语言等）

推荐选项 A，删除 SettingsPage + 移除路由。

### 验证
```bash
test -f apps/web/src/features/datasources/DatasourcesPage.tsx && echo "✓" || echo "✗"
```
输出必须 = ✓。

```bash
grep -c "/datasources\b" apps/web/src/App.tsx
```
输出必须 ≥ 1。

```bash
grep -c "navigate.*datasources" apps/web/src/components/layout/AppShell.tsx
```
输出必须 ≥ 2（侧栏 + 切换器）。

---

## Task 6.5 · 对话页适配 AppShell — 去除双层 sidebar

### 定位
`apps/web/src/features/chat/components/ChatWindow.tsx` + `apps/web/src/components/layout/AppShell.tsx`

### 问题
ChatWindow 被包在 AppShell 里，导致双层 sidebar（AppShell 240px + ChatWindow SessionSidebar 280px）。原型是对话页有自己的三栏布局，不套 AppShell。

### 改什么

**方案**：ChatWindow 路由不套 AppShell，自己提供完整布局

**1. App.tsx 中 ChatWindow 路由不套 Shell**

```tsx
// 修改前
<Route path="/chat/:datasourceId" element={<Shell><ChatWindow /></Shell>} />

// 修改后 — ChatWindow 自己渲染布局（含返回 AppShell 的入口）
<Route path="/chat/:datasourceId" element={
  <RequireAuth>
    <ChatWindow />
  </RequireAuth>
} />
```

**2. ChatWindow 顶部加返回 AppShell 的导航**

在 ChatWindow 的 header 区加一个「返回工作台」按钮：

```tsx
// ChatWindow.tsx header 内
<button
  className="btn btn-ghost btn-sm"
  onClick={() => navigate(`/dashboard/${datasourceId}`)}
  title="返回工作台"
>
  <ArrowLeft size={16} />
  返回工作台
</button>
```

**3. ChatWindow 加右侧上下文面板（原型核心）**

原型 chat 页有三栏：左侧会话列表 + 中间对话 + 右侧上下文（Token/工具/数据源）。

在 ChatWindow 的布局中加右侧面板：

```tsx
// ChatWindow.tsx 主布局
<div className="chat-layout">
  {/* 左侧会话列表 240px */}
  <SessionSidebar />
  
  {/* 中间对话主区 flex-1 */}
  <main className="chat-main">
    <header>...</header>
    <div className="chat-messages">...</div>
    <ChatInput />
  </main>
  
  {/* 右侧上下文面板 320px（新增） */}
  <aside className="chat-context-panel">
    <div className="context-section">
      <h3>使用工具</h3>
      {/* 列出当前对话调用的工具 */}
    </div>
    <div className="context-section">
      <h3>数据源</h3>
      {/* 当前数据源状态 */}
    </div>
    <div className="context-section">
      <h3>Token 消耗</h3>
      {/* 输入/输出/合计 Token */}
    </div>
    <div className="context-section">
      <h3>耗时</h3>
      {/* 总耗时 */}
    </div>
  </aside>
</div>
```

**4. 响应式：小屏隐藏右侧面板**

```css
@media (max-width: 1280px) {
  .chat-context-panel { display: none; }
}
```

### 验证
```bash
grep -c "Shell.*ChatWindow\|ChatWindow.*Shell" apps/web/src/App.tsx
```
输出必须 = 0（ChatWindow 不再套 Shell）。

```bash
grep -c "chat-context-panel\|context-section" apps/web/src/features/chat/components/ChatWindow.tsx
```
输出必须 ≥ 2（右侧面板已加）。

```bash
grep -c "返回工作台\|ArrowLeft" apps/web/src/features/chat/components/ChatWindow.tsx
```
输出必须 ≥ 1。

---

## Task 6.6 · 对话页 header 适配 — 显示 Schema 已确认状态

### 定位
`apps/web/src/features/chat/components/ChatWindow.tsx`

### 问题
原型 chat 页 header 有「Schema 已确认」badge + 可用表列表 + 推荐提问。实际 ChatWindow header 还是旧的（只显示标题 + 状态点）。

### 改什么

修改 ChatWindow 的 header（搜索 `<header` 在 ChatWindow 内的位置）：

```tsx
<header className="chat-header">
  <div className="chat-header-left">
    <button onClick={() => navigate(`/dashboard/${datasourceId}`)}>
      <ArrowLeft /> 返回工作台
    </button>
    <span className="badge badge-success">● Schema 已确认</span>
    <span className="chat-header-meta">
      基于 {tableCount} 张表 · {fieldCount} 字段
    </span>
  </div>
  <div className="chat-header-right">
    <span className="chip">生产分析 Agent</span>
    <span className="chip green">良品率诊断工具</span>
    <span className="chip">{datasourceName}</span>
  </div>
</header>
```

### 验证
```bash
grep -c "Schema 已确认" apps/web/src/features/chat/components/ChatWindow.tsx
```
输出必须 ≥ 1。

---

## Task 6.7 · 最终验证

### 创建 check-fix-6.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-6 验证 ==="

echo "[Task 6.1-6.2] 探索页动态化..."
cd apps/server
grep -q "sseEvent.*progress" src/modules/schema-explorer/explore.service.ts || { echo "✗ FAIL: 后端无 progress 事件"; exit 1; }
cd ../../apps/web
grep -q "progressItems" src/features/explore/hooks/useSSEExplore.ts || { echo "✗ FAIL: 前端无 progressItems"; exit 1; }
grep -q "table_discovered\|field_analyzed" src/features/explore/ExplorePage.tsx || { echo "✗ FAIL: 前端无细粒度渲染"; exit 1; }
echo "  ✓ 探索页已动态化"

echo "[Task 6.3-6.4] 设置页拆分..."
test -f src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL: LlmConfigPage 不存在"; exit 1; }
test -f src/features/datasources/DatasourcesPage.tsx || { echo "✗ FAIL: DatasourcesPage 不存在"; exit 1; }
grep -q "/llm-config" ../../apps/web/src/App.tsx || { echo "✗ FAIL: 无 /llm-config 路由"; exit 1; }
grep -q "/datasources" ../../apps/web/src/App.tsx || { echo "✗ FAIL: 无 /datasources 路由"; exit 1; }
echo "  ✓ 设置页已拆分"

echo "[Task 6.5-6.6] 对话页适配..."
COUNT=$(grep -c "Shell.*ChatWindow\|ChatWindow.*Shell" ../../apps/web/src/App.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: ChatWindow 仍套 Shell"; exit 1; fi
grep -q "chat-context-panel\|context-section" src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL: 无右侧面板"; exit 1; }
grep -q "Schema 已确认" src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL: 无 Schema 状态"; exit 1; }
echo "  ✓ 对话页已适配"

echo ""
echo "[最终] TS 编译 + lint..."
cd ../../apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../.. && pnpm lint > /dev/null 2>&1 || { echo "✗ FAIL: lint"; exit 1; }
echo "  ✓ 全量编译通过"

echo ""
echo "====================================="
echo "✓ Fix-6 验证全部通过"
echo "====================================="
```

### 验证
```bash
bash docs/implementation/verification/check-fix-6.sh
```

---

## Fix-6 完成标准

✅ Task 6.1: 后端 explore SSE 推送 `progress` 事件（table_discovered / field_analyzed / relation_inferred）
✅ Task 6.2: 前端 ExplorePage 渲染细粒度进度（逐表/逐字段滚出 + 动画）
✅ Task 6.3: LLM 配置独立为 `/llm-config` 页面
✅ Task 6.4: 数据源管理独立为 `/datasources` 页面
✅ Task 6.5: ChatWindow 不套 AppShell，自己提供三栏布局 + 右侧上下文面板
✅ Task 6.6: ChatWindow header 显示 Schema 已确认状态

## 修复后的效果

### 探索页
- 5 步进度条 + 每步实时滚出发现细节
- 第 2 步：`▸ orders (48,237 行 · 12 列)` 逐表出现
- 第 3 步：`✓ orders.id → 订单唯一标识 (PK, 置信度 0.95)` `⏳ orders.status → 待确认 (置信度 0.62)` 逐字段出现
- 第 4 步：`→ orders.cust_id → customers.id` 关系逐条出现
- 日志面板实时滚动

### 设置页
- 侧栏「数据源管理」→ `/datasources` 独立页面（统计卡片 + 表格 + 添加按钮）
- 侧栏「模型配置」→ `/llm-config` 独立页面（Provider 卡片 + 表单 + 测试 + 安全提示）
- 不再杂糅在一个 tab 里

### 对话页
- 独立三栏布局（不套 AppShell）
- 左侧会话列表 240px
- 中间对话主区（header 有「Schema 已确认」badge + 返回工作台按钮）
- 右侧上下文面板 320px（使用工具 / 数据源 / Token / 耗时）

---
*AI生成*
