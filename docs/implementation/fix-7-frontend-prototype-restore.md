# Fix-7 · 前端严格还原原型（高保真）

> **执行前提**：停止所有后端改动，先把前端 UI 严格还原成原型样子
> **预计耗时**：2-3 天
> **目标**：所有前端页面 1:1 还原 `download/flowagent/index.html` + `pages.js` 的视觉效果
> **原则**：UI 第一，数据第二（先用 mock 数据让 UI 跑起来，后端对接留到 Fix-8）

---

## 0. 还原原则（必读）

### 0.1 原型位置
- 原型 HTML：`/home/z/my-project/download/flowagent/index.html`
- 原型页面 JS：`/home/z/my-project/download/flowagent/pages.js`
- 原型截图参考：已通过 Agent Browser 验证过完整流程

### 0.2 还原规则

✅ **必须 1:1 还原**：
- 所有 CSS 类名、颜色、间距、字号、动画
- 原型的布局结构（三栏、双栏、卡片网格）
- 原型的交互（hover、动画、过渡）

✅ **数据先用 mock**：
- 不调后端 API，先用硬编码数据让 UI 跑起来
- mock 数据直接从原型 pages.js 复制
- 后端对接留到 Fix-8

✅ **保留现有路由结构**：
- 路由路径不变（`/dashboard/:id` `/chat/:id` 等）
- 只改页面组件的渲染逻辑

❌ **禁止**：
- 不要改后端代码
- 不要引入新依赖
- 不要"优化"原型设计（原型是什么样就什么样）
- 不要合并页面（原型是独立页面就保持独立）

### 0.3 还原清单（18 个页面）

| 原型页面 | 目标文件 | 还原来源 |
|---|---|---|
| 登录页 | `features/auth/LoginPage.tsx` | index.html `#auth-login` |
| 注册页 | `features/auth/RegisterPage.tsx` | index.html `#auth-register` |
| 首次引导 | `features/onboarding/OnboardingPage.tsx` | pages.js `PAGES.onboarding` |
| 数据源列表 | `features/datasources/DatasourcesPage.tsx`（新建） | pages.js `PAGES['datasource-list']` |
| 连接数据库 | `features/datasources/ConnectDatabasePage.tsx`（新建） | pages.js `PAGES['datasource-new']` |
| 上传 CSV | `features/datasources/UploadCsvPage.tsx`（新建） | pages.js `PAGES['datasource-csv']` |
| 探索进度 | `features/explore/ExplorePage.tsx` | pages.js `PAGES.explore` |
| Schema 纠错 | `features/schema-review/SchemaReviewPage.tsx` | pages.js `PAGES['schema-review']` |
| Schema 敲定 | `features/schema-review/ConfirmPage.tsx` | pages.js `PAGES.confirm` |
| 工作台 | `features/dashboard/DashboardPage.tsx` | pages.js `PAGES.dashboard` |
| 对话追问 | `features/chat/components/ChatWindow.tsx` | pages.js `PAGES.chat` |
| 主动洞察 | `features/insights/InsightsPage.tsx` | pages.js `PAGES.insights` |
| Schema 修订 | `features/schema-review/SchemaRevisePage.tsx`（新建） | pages.js `PAGES.schema` |
| 探索历史 | `features/history/HistoryPage.tsx` | pages.js `PAGES.history` |
| 模型配置 | `features/llm-config/LlmConfigPage.tsx`（新建） | pages.js `PAGES['llm-config']` |
| 用户管理 | `features/admin/UsersPage.tsx` | pages.js `PAGES.users` |
| 角色权限 | `features/admin/RolesPage.tsx` | pages.js `PAGES.roles` |
| 个人设置 | `features/profile/ProfilePage.tsx` | pages.js `PAGES.profile` |

---

## Task 7.0 · 提取原型 CSS 到项目

### 定位
- 源：`download/flowagent/index.html` 的 `<style>` 标签（line 9-441，约 432 行）
- 目标：`apps/web/src/index.css`（当前 904 行，需替换或合并）

### 改什么

**1. 读取原型 CSS**

读取 `/home/z/my-project/download/flowagent/index.html` 的 line 9-441（`<style>` 标签内容）。

**2. 替换 `apps/web/src/index.css`**

把原型 `<style>` 标签内的所有 CSS **完整复制**到 `apps/web/src/index.css`，替换现有内容。

**注意**：
- 保留 Tailwind 指令（`@tailwind base; @tailwind components; @tailwind utilities;`）在文件顶部
- 原型 CSS 放在 Tailwind 指令之后
- 不要删除现有的 CSS 变量定义（`:root { ... }`），用原型的替换

**3. 确认关键 CSS 类存在**

```bash
grep -c "explore-step\|schema-review-layout\|chat-layout\|kpi-card\|onboarding-card" apps/web/src/index.css
```
输出必须 ≥ 5。

### 验证
```bash
grep -c "explore-step-detail\|review-chat-messages\|chat-context-panel\|datasource-switcher" apps/web/src/index.css
```
输出必须 ≥ 4。

---

## Task 7.1 · 还原登录页

### 定位
`apps/web/src/features/auth/LoginPage.tsx`

### 改什么

**1. 读取原型登录页**

读取 `/home/z/my-project/download/flowagent/index.html` 中 `id="auth-login"` 的 div（搜索 `<div id="auth-login"`）。

**2. 1:1 还原到 LoginPage.tsx**

把原型 HTML 转为 JSX：
- `class=` → `className=`
- `onclick=` → `onClick=`
- 内联 `style` 保持
- SVG 图标保持

**3. 保留现有 API 调用**

登录逻辑（`authApi.login` + `useAuthStore.setAuth`）保留，只改 UI 渲染。

**关键元素**（必须还原）：
- 左右分栏布局（`.auth-left` + `.auth-right`）
- 左侧品牌 + 大标题 + 3 个 feature 卡片
- 右侧登录表单（工作空间/账号/密码 + 记住我 + 忘记密码）
- SSO 按钮（GitHub/Google/LDAP）
- 底部版权信息

### 验证
```bash
grep -c "auth-left\|auth-right\|auth-brand\|auth-features" apps/web/src/features/auth/LoginPage.tsx
```
输出必须 ≥ 4。

---

## Task 7.2 · 还原注册页

### 定位
`apps/web/src/features/auth/RegisterPage.tsx`

### 改什么

读取原型 `id="auth-register"` 的 div，1:1 还原。

**关键元素**：
- 左侧品牌 + 大标题
- 右侧注册表单（邀请码/姓名/邮箱/密码）
- 角色说明提示框（info-light 背景）
- 返回登录链接

### 验证
```bash
grep -c "auth-form-title\|inviteCode\|auth-switch" apps/web/src/features/auth/RegisterPage.tsx
```
输出必须 ≥ 3。

---

## Task 7.3 · 还原首次引导页

### 定位
`apps/web/src/features/onboarding/OnboardingPage.tsx`

### 改什么

**1. 读取原型**

读取 `download/flowagent/pages.js` 中 `PAGES.onboarding` 的 HTML 字符串。

**2. 1:1 还原**

**关键元素**：
- `.onboarding-page` 居中布局
- `.onboarding-card` 大卡片
- `.onboarding-logo` 64px 圆角图标
- `.mode-grid` 两列网格（连接数据库 + 上传 CSV）
- 两个 `.mode-card`（绿色 + 琥珀色变体）
- 底部 info 提示 + 安全说明

**3. 暂时用 mock 检测**

```tsx
// 暂时 mock：假设没有数据源，永远显示引导
useEffect(() => {
  setChecking(false);
}, []);
```

点击「连接数据库」→ `navigate('/datasources/new')`
点击「上传 CSV」→ `navigate('/datasources/csv')`

### 验证
```bash
grep -c "onboarding-card\|mode-grid\|mode-card" apps/web/src/features/onboarding/OnboardingPage.tsx
```
输出必须 ≥ 3。

---

## Task 7.4 · 新建数据源列表页

### 定位
新建 `apps/web/src/features/datasources/DatasourcesPage.tsx`

### 改什么

**1. 读取原型**

读取 `pages.js` 中 `PAGES['datasource-list']`。

**2. 新建文件**

1:1 还原原型：
- `.page-header`（标题 + 上传 CSV + 连接数据库 按钮）
- 4 个统计卡片（`.grid grid-4`）
- 数据源列表表格（`.card` + `.table`）
- 表格行：数据源名称（图标+名称+类型）/ 类型 / 连接信息 / 表数 / 状态 / 最近探索 / 操作

**3. Mock 数据**

```tsx
const MOCK_DATASOURCES = [
  {
    id: 'ds_001',
    name: 'ecommerce_db',
    type: 'PostgreSQL',
    host: '192.168.1.100:5432',
    tables: 8,
    status: 'online',
    lastExplore: '2026-07-14 14:32',
  },
];
```

### 验证
```bash
test -f apps/web/src/features/datasources/DatasourcesPage.tsx && echo "✓" || echo "✗"
grep -c "page-header\|grid grid-4\|table" apps/web/src/features/datasources/DatasourcesPage.tsx
```

---

## Task 7.5 · 新建连接数据库页

### 定位
新建 `apps/web/src/features/datasources/ConnectDatabasePage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES['datasource-new']`，1:1 还原：

**关键元素**：
- `.page-header`（标题 + 「改用 CSV 上传」按钮）
- `.card` 大卡片
- `.db-type-grid` 4 列数据库类型选择（PostgreSQL/MySQL/SQLite/SQL Server）
- 表单字段（主机/端口/数据库名/Schema/用户名/密码/数据源名称）
- 只读模式提示框（green-lighter 背景）
- 测试连接 + 开始探索 按钮

### 验证
```bash
test -f apps/web/src/features/datasources/ConnectDatabasePage.tsx && echo "✓" || echo "✗"
grep -c "db-type-grid\|db-type-card\|form-row" apps/web/src/features/datasources/ConnectDatabasePage.tsx
```

---

## Task 7.6 · 新建上传 CSV 页

### 定位
新建 `apps/web/src/features/datasources/UploadCsvPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES['datasource-csv']`，1:1 还原：

**关键元素**：
- `.page-header`（标题 + 「改用数据库连接」按钮）
- `.csv-upload-zone` 拖拽区（虚线边框 + 图标 + 文字 + 提示）
- 已上传文件列表（3 个 mock 文件卡片：orders.csv / customers.csv / products.csv）
- 表关系预推断面板（`.bg-secondary` 背景 + 等宽字体）
- 安全提示框（green-lighter）

### 验证
```bash
test -f apps/web/src/features/datasources/UploadCsvPage.tsx && echo "✓" || echo "✗"
grep -c "csv-upload-zone\|csv-upload-icon\|csv-upload-text" apps/web/src/features/datasources/UploadCsvPage.tsx
```

---

## Task 7.7 · 还原探索进度页（含动态效果）

### 定位
`apps/web/src/features/explore/ExplorePage.tsx`

### 改什么

**1. 读取原型**

读取 `pages.js` 中 `PAGES.explore`。

**2. 1:1 还原视觉**

**关键元素**：
- 居中标题 + 副标题
- 总进度条卡片（`.card` + 进度条 + 百分比）
- 5 步时间线（`.explore-step` × 5）
  - 每步：圆形图标 + 标题 + 描述 + `.explore-step-detail`（细节面板）
- 日志面板（深色背景 `#1e293b` + 等宽字体 + 颜色编码）
- 底部操作按钮

**3. 前端模拟动态效果**（不等后端 progress 事件）

用 `setInterval` 模拟 SSE 流，逐条滚出发现细节：

```tsx
import { useState, useEffect, useRef } from 'react';

const MOCK_PROGRESS = [
  { step: 1, type: 'log', text: '[14:32:08] ✓ Connecting to postgresql://192.168.1.100:5432/ecommerce_db' },
  { step: 1, type: 'log', text: '[14:32:09] ✓ Connection established · pg_version=16.2' },
  { step: 2, type: 'table', data: { name: 'orders', rowCount: 48237, columns: 12 } },
  { step: 2, type: 'table', data: { name: 'customers', rowCount: 3248, columns: 9 } },
  { step: 2, type: 'table', data: { name: 'products', rowCount: 486, columns: 11 } },
  { step: 2, type: 'table', data: { name: 'order_items', rowCount: 98432, columns: 7 } },
  { step: 2, type: 'log', text: '[14:32:10] ✓ Found 12 tables (8 business + 4 system)' },
  { step: 3, type: 'field', data: { table: 'orders', field: 'id', meaning: '订单唯一标识 (PK)', role: '主键', confidence: 0.98, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'cust_id', meaning: '客户 ID (FK → customers.id)', role: '外键', confidence: 0.95, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'total_amt', meaning: '订单总金额（元）', role: '指标', confidence: 0.92, confirmed: true } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'status', meaning: '状态字段 (含义待确认)', role: '维度', confidence: 0.62, confirmed: false } },
  { step: 3, type: 'field', data: { table: 'orders', field: 'coupon_code', meaning: '优惠券代码 (是否敏感?)', role: '未知', confidence: 0.58, confirmed: false } },
  { step: 3, type: 'log', text: '[14:32:16] ⏳ Marked 4 fields as "needs user confirmation"' },
  // ... 更多
];

export default function ExplorePage() {
  const [visibleProgress, setVisibleProgress] = useState<typeof MOCK_PROGRESS>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (indexRef.current >= MOCK_PROGRESS.length) {
        clearInterval(timer);
        setCurrentStep(5); // 完成
        return;
      }
      const item = MOCK_PROGRESS[indexRef.current];
      setVisibleProgress(prev => [...prev, item]);
      if (item.step > currentStep) setCurrentStep(item.step);
      indexRef.current++;
    }, 800); // 每 800ms 推一条

    return () => clearInterval(timer);
  }, []);

  // ... 渲染
}
```

**4. 细节面板渲染**

```tsx
{visibleProgress.filter(p => p.step === stepNum).map((p, i) => {
  if (p.type === 'table') {
    return <div key={i} className="progress-line">▸ {p.data.name} ({p.data.rowCount.toLocaleString()} 行 · {p.data.columns} 列)</div>;
  }
  if (p.type === 'field') {
    const icon = p.data.confirmed ? '✓' : '⏳';
    const color = p.data.confirmed ? 'var(--green-dark)' : 'var(--amber)';
    return <div key={i} className="progress-line" style={{ color }}>{icon} {p.data.table}.{p.data.field} → {p.data.meaning} (置信度 {p.data.confidence})</div>;
  }
  return null;
})}
```

### 验证
```bash
grep -c "explore-step\|explore-step-detail\|progress-line" apps/web/src/features/explore/ExplorePage.tsx
```
输出必须 ≥ 3。

```bash
grep -c "setInterval\|MOCK_PROGRESS" apps/web/src/features/explore/ExplorePage.tsx
```
输出必须 ≥ 2（有 mock 动态效果）。

---

## Task 7.8 · 还原 Schema 纠错对话页

### 定位
`apps/web/src/features/schema-review/SchemaReviewPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES['schema-review']`，1:1 还原：

**关键元素**：
- `.page-header`（标题 + 重新探索 + 全部确认 按钮）
- `.schema-review-layout` 双栏布局
  - 左栏 `.schema-tree`（320px）：表树 + 状态统计
  - 右栏 `.review-chat`：对话区
- 左栏表树项（`.schema-table-item`）含 confirmed/has-issue 状态指示
- 右栏消息流（`.review-message` × N）
  - AI 消息含 `.schema-field-card`（字段表）
  - AI 提问含 `.quick-reply` 快捷回复按钮
- 底部输入区 `.review-input-area`

**Mock 数据**：直接用原型里的对话内容（orders 表的 4 个字段提问）。

### 验证
```bash
grep -c "schema-review-layout\|schema-tree\|review-chat\|schema-field-card\|quick-reply" apps/web/src/features/schema-review/SchemaReviewPage.tsx
```
输出必须 ≥ 4。

---

## Task 7.9 · 还原 Schema 敲定页

### 定位
`apps/web/src/features/schema-review/ConfirmPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.confirm`，1:1 还原：

**关键元素**：
- 4 个统计卡片（业务表/字段总数/识别关系/敏感字段）
- 表关系 ER 简图（`.card` + 4 列网格 + 箭头连接）
- 字段语义汇总表（`.table` 含表/字段/类型/Agent理解/角色/用户确认/敏感）
- 底部准备就绪提示框（green-lighter）

**Mock 数据**：用原型的 8 张表 + 67 字段 + 7 关系。

### 验证
```bash
grep -c "ER 简图\|字段语义汇总\|准备就绪" apps/web/src/features/schema-review/ConfirmPage.tsx
```
输出必须 ≥ 2。

---

## Task 7.10 · 还原工作台页

### 定位
`apps/web/src/features/dashboard/DashboardPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.dashboard`，1:1 还原：

**关键元素**：
- `.page-header`（标题 + 刷新/修订 Schema/问 Agent 按钮）
- Agent 自主生成说明条（green-lighter）
- 5 个 KPI 卡片（`.grid grid-5` + `.kpi-card` 带彩色顶条）
- 3 个图表区（`.grid grid-3`）
  - 左侧大图：订单量与销售额趋势（`grid-column: span 2`）
  - 右侧小图：订单渠道分布
- 第二行 3 个卡片（客户等级/订单状态流转/Agent 主动洞察）
- 底部数据库结构概览（8 张表卡片网格）

**图表用 ECharts 真实渲染**（复用 chat 模块的 DynamicChart 或直接用 echarts）。

**Mock 数据**：用原型的数值（48237 单 / ¥8.42M / 3248 人 等）。

### 验证
```bash
grep -c "kpi-card\|chart-container\|grid grid-5\|grid grid-3" apps/web/src/features/dashboard/DashboardPage.tsx
```
输出必须 ≥ 3。

---

## Task 7.11 · 还原对话追问页（三栏布局）

### 定位
`apps/web/src/features/chat/components/ChatWindow.tsx`

### 改什么

**1. 读取原型**

读取 `pages.js` 中 `PAGES.chat`。

**2. ChatWindow 不套 AppShell**

修改 `App.tsx`，ChatWindow 路由不套 `<Shell>`：
```tsx
<Route path="/chat/:datasourceId" element={
  <RequireAuth>
    <ChatWindow />
  </RequireAuth>
} />
```

**3. 1:1 还原三栏布局**

```tsx
<div className="chat-layout">
  {/* 左侧会话列表 240px */}
  <div className="chat-sidebar">...</div>
  
  {/* 中间对话主区 */}
  <div className="chat-main">
    <div className="chat-header">
      <span className="badge badge-success">● Schema 已确认</span>
      <span>基于 8 张表 · 67 字段 · 7 关系</span>
    </div>
    <div className="chat-messages">...</div>
    <div className="chat-input-area">...</div>
  </div>
  
  {/* 右侧上下文面板 320px */}
  <div className="chat-right">
    <div>使用工具</div>
    <div>数据源</div>
    <div>Token 消耗</div>
    <div>耗时</div>
  </div>
</div>
```

**4. Mock 对话内容**

用原型的对话（用户问 Top 5 商品 + AI 调用工具 + 图表 + 洞察）。

### 验证
```bash
grep -c "chat-layout\|chat-sidebar\|chat-main\|chat-right" apps/web/src/features/chat/components/ChatWindow.tsx
```
输出必须 ≥ 4。

```bash
grep -c "Shell.*ChatWindow\|ChatWindow.*Shell" apps/web/src/App.tsx
```
输出必须 = 0。

---

## Task 7.12 · 还原主动洞察页

### 定位
`apps/web/src/features/insights/InsightsPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.insights`，1:1 还原：

**关键元素**：
- `.page-header`（标题 + range 选择器 + 配置巡检按钮）
- 巡检状态卡片（绿色圆圈 + 今日巡检已完成 + 3 个 badge）
- 3 个洞察卡片（红/黄/绿色变体）
  - 每张卡片：header（图标+标题+严重度+操作按钮）+ body（描述+探索过程+建议）+ footer
- 探索过程用 `.bg-secondary` + 等宽字体

**Mock 数据**：用原型的 3 条洞察（客单价下降 / app 取消率上升 / VIP 复购提升）。

### 验证
```bash
grep -c "insights\|巡检\|探索过程\|建议" apps/web/src/features/insights/InsightsPage.tsx
```
输出必须 ≥ 3。

---

## Task 7.13 · 还原 Schema 修订页

### 定位
新建 `apps/web/src/features/schema-review/SchemaRevisePage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.schema`，1:1 还原：

**关键元素**：
- 当前 Schema 理解概览（4 个统计卡片）
- 何时需要重新探索（4 条说明）
- 修订入口（3 个卡片：进入纠错对话 / 完全重新探索 / 手动编辑 JSON）

### 验证
```bash
test -f apps/web/src/features/schema-review/SchemaRevisePage.tsx && echo "✓" || echo "✗"
```

---

## Task 7.14 · 还原探索历史页

### 定位
`apps/web/src/features/history/HistoryPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.history`，1:1 还原：

**关键元素**：
- `.page-header`（标题）
- `.card` + `.table` 历史记录表
- 4 行 mock 数据（首次接入 / 连接测试 / Schema 修订 / 首次接入）

### 验证
```bash
grep -c "首次接入\|连接测试\|Schema 修订" apps/web/src/features/history/HistoryPage.tsx
```
输出必须 ≥ 2。

---

## Task 7.15 · 新建模型配置页

### 定位
新建 `apps/web/src/features/llm-config/LlmConfigPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES['llm-config']`，1:1 还原：

**关键元素**：
- `.page-header`（标题 + 管理员专属 badge）
- `.tabs`（Provider 配置 / 默认模型 / Token 配额 / 调用日志）
- 3 个 Provider 卡片（OpenAI 已配置 / Anthropic 未配置 / 本地 LLM 未配置）
- 默认模型选择区（Schema 理解模型 + 对话分析模型）
- 高级参数（Temperature / Max Tokens / Timeout）
- 安全提示框（error-light 背景）

### 验证
```bash
test -f apps/web/src/features/llm-config/LlmConfigPage.tsx && echo "✓" || echo "✗"
grep -c "Provider\|默认模型\|Token 配额\|管理员专属" apps/web/src/features/llm-config/LlmConfigPage.tsx
```

---

## Task 7.16 · 还原用户管理页

### 定位
`apps/web/src/features/admin/UsersPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.users`，1:1 还原：

**关键元素**：
- 4 个统计卡片（用户总数/管理员/分析师/查看者）
- 用户表格（用户头像+姓名+邮箱 / 角色 / 数据源权限 / 最近登录 / 状态 / 操作）
- 5 行 mock 用户数据

### 验证
```bash
grep -c "管理员\|分析师\|查看者\|grid grid-4" apps/web/src/features/admin/UsersPage.tsx
```
输出必须 ≥ 3。

---

## Task 7.17 · 还原角色权限页

### 定位
`apps/web/src/features/admin/RolesPage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.roles`，1:1 还原：

**关键元素**：
- 3 个角色卡片（管理员/分析师/查看者，含人数 + 权限点 chip）
- 权限点矩阵表（`.perm-matrix`）
  - 11 行权限点 × 3 列角色
  - 每格一个 checkbox
- 保存权限配置按钮

### 验证
```bash
grep -c "perm-matrix\|perm-checkbox\|权限点矩阵" apps/web/src/features/admin/RolesPage.tsx
```
输出必须 ≥ 2。

---

## Task 7.18 · 还原个人设置页

### 定位
`apps/web/src/features/profile/ProfilePage.tsx`

### 改什么

读取 `pages.js` 中 `PAGES.profile`，1:1 还原：

**关键元素**：
- 2 列网格
- 左卡片：基本信息（头像 + 姓名 + 邮箱 + 角色 + 保存按钮）
- 右卡片：修改密码（当前/新/确认 + 修改按钮）
- 底部全宽卡片：会话与安全（双因素认证开关 / 登录通知开关 / 退出所有会话）

### 验证
```bash
grep -c "基本信息\|修改密码\|会话与安全\|双因素认证" apps/web/src/features/profile/ProfilePage.tsx
```
输出必须 ≥ 3。

---

## Task 7.19 · 更新路由 + 侧栏

### 定位
`apps/web/src/App.tsx` + `apps/web/src/components/layout/AppShell.tsx`

### 改什么

**1. App.tsx 路由更新**

```tsx
import DatasourcesPage from './features/datasources/DatasourcesPage';
import ConnectDatabasePage from './features/datasources/ConnectDatabasePage';
import UploadCsvPage from './features/datasources/UploadCsvPage';
import LlmConfigPage from './features/llm-config/LlmConfigPage';
import SchemaRevisePage from './features/schema-review/SchemaRevisePage';

<Route path="/datasources" element={<Shell><DatasourcesPage /></Shell>} />
<Route path="/datasources/new" element={<Shell><ConnectDatabasePage /></Shell>} />
<Route path="/datasources/csv" element={<Shell><UploadCsvPage /></Shell>} />
<Route path="/llm-config" element={<Shell><LlmConfigPage /></Shell>} />
<Route path="/schema/:datasourceId" element={<Shell><SchemaRevisePage /></Shell>} />
<Route path="/chat/:datasourceId" element={<RequireAuth><ChatWindow /></RequireAuth>} />
```

**2. AppShell 侧栏导航更新**

按原型侧栏结构：
```
工作台区：
- 工作台首页 → /dashboard/:id
- 对话追问 → /chat/:id（不套 Shell）

数据与看板区：
- 数据源管理 → /datasources
- 看板中心 → /dashboard/:id（暂同工作台）
- 报告导出 → (暂留)

智能体区：
- Agent 市场 → (暂留)
- 工具市场 → (暂留)

管理区（仅管理员）：
- 模型配置 → /llm-config
- 用户与权限 → /admin/users
- 角色权限 → /admin/roles
- Schema 修订 → /schema/:id
- 探索历史 → /history
```

**3. 删除 SettingsPage**

如果 SettingsPage 不再需要（LLM 和数据源都拆分了），删除路由 + 文件。

### 验证
```bash
grep -c "/datasources\|/llm-config\|/chat/" apps/web/src/App.tsx
```
输出必须 ≥ 3。

---

## Task 7.20 · 最终验证

### 创建 check-fix-7.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-7 前端还原验证 ==="

echo "[7.0] CSS 还原..."
grep -q "explore-step\|schema-review-layout\|chat-layout\|kpi-card\|onboarding-card" apps/web/src/index.css || { echo "✗ FAIL"; exit 1; }
echo "  ✓ CSS 已还原"

echo "[7.1-7.2] 登录注册页..."
grep -q "auth-left\|auth-right" apps/web/src/features/auth/LoginPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 登录注册已还原"

echo "[7.3] 首次引导..."
grep -q "onboarding-card\|mode-grid" apps/web/src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 引导页已还原"

echo "[7.4-7.6] 数据源页面..."
test -f apps/web/src/features/datasources/DatasourcesPage.tsx || { echo "✗ FAIL"; exit 1; }
test -f apps/web/src/features/datasources/ConnectDatabasePage.tsx || { echo "✗ FAIL"; exit 1; }
test -f apps/web/src/features/datasources/UploadCsvPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 数据源页面已新建"

echo "[7.7] 探索页动态化..."
grep -q "explore-step-detail\|setInterval\|MOCK_PROGRESS" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 探索页已动态化"

echo "[7.8-7.9] Schema 纠错+敲定..."
grep -q "schema-review-layout\|schema-tree\|review-chat" apps/web/src/features/schema-review/SchemaReviewPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Schema 页面已还原"

echo "[7.10] 工作台..."
grep -q "kpi-card\|chart-container" apps/web/src/features/dashboard/DashboardPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 工作台已还原"

echo "[7.11] 对话页三栏..."
grep -q "chat-layout\|chat-sidebar\|chat-main\|chat-right" apps/web/src/features/chat/components/ChatWindow.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 对话页已还原"

echo "[7.12] 洞察页..."
grep -q "巡检\|探索过程" apps/web/src/features/insights/InsightsPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 洞察页已还原"

echo "[7.13-7.18] 其他页面..."
test -f apps/web/src/features/schema-review/SchemaRevisePage.tsx || { echo "✗ FAIL"; exit 1; }
test -f apps/web/src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "perm-matrix" apps/web/src/features/admin/RolesPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 其他页面已还原"

echo "[7.19] 路由+侧栏..."
grep -q "/datasources\|/llm-config" apps/web/src/App.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 路由已更新"

echo ""
echo "[最终] TS 编译..."
cd apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-7 前端还原全部通过"
echo "====================================="
```

### 验证
```bash
bash docs/implementation/verification/check-fix-7.sh
```

---

## Fix-7 完成标准

✅ 18 个页面全部 1:1 还原原型
✅ CSS 完整复制到 index.css
✅ 探索页有动态滚出效果（mock 数据）
✅ 对话页三栏布局（不套 AppShell）
✅ 设置页拆分为独立的数据源管理 + 模型配置
✅ 所有页面用 mock 数据可独立运行
✅ TS 编译通过

## 还原后的下一步

Fix-7 完成后，前端 UI 与原型完全一致。然后可以：
- **Fix-8**：把 mock 数据替换为真实 API 调用
- **Fix-9**：后端 progress 事件对接
- **Fix-10**：端到端联调

但这些都是 Fix-7 之后的事。**现在只做前端还原**。

---
*AI生成*
