# 对话追问页：原型 vs 当前实现 — 差距分析与重构方案

> 评审时间：2026-07-16
> 评审基线：sprint-5-7 commit 7f3d33f
> 对比对象：`download/flowagent/pages.js` PAGES.chat（原型） vs `apps/web/src/features/chat/`（当前实现）

---

## 一、原型设计分析

### 1.1 原型三栏布局

```
┌──────────┬──────────────────────────────┬──────────┐
│ 左 240px  │ 中间 flex-1                   │ 右 320px  │
│           │                               │           │
│ 💡 推荐提问│ ┌─ Schema 已确认 badge ──────┐│ 🔧 使用工具│
│ • 本月Top5│ │                              ││ • query_data│
│ • 客户流失│ │ 用户消息气泡                  ││             │
│ • 渠道转化│ │                              ││ 📊 数据源    │
│ • 退款分析│ │ AI 消息气泡                   ││ • ecommerce_db│
│ • VIP复购│ │   ├ 策略说明                  ││             │
│           │ │   ├ 🔧 工具调用卡片（SQL 展示）││ 📊 Token 消耗│
│ 🗂️ 可用表  │ │   ├ 📊 查询结果表格           ││ • 输入 4,238│
│ • customers│ │   └ 分析文本（含高亮+建议）  ││ • 输出 1,856│
│ • orders  │ │                              ││ • 合计 6,094│
│ • + 6张表 │ └──────────────────────────────┘│             │
│           │                               │ ⏱️ 耗时     │
│           │ [基于已确认的Schema，问任何问题] │ • 总耗时 8.2s│
└──────────┴──────────────────────────────┴──────────┘
```

### 1.2 原型的 6 个核心设计意图

| # | 设计意图 | 原型实现方式 |
|---|---|---|
| 1 | **上下文感知** — 用户知道当前对话基于哪个 Schema | header 显示「Schema 已确认」badge + 「8 张表 · 67 字段 · 7 关系」 |
| 2 | **工具调用过程可视化** — 用户看到 Agent 的思考链路 | AI 消息内嵌工具调用卡片（深色 header + SQL 代码 + 返回行数/耗时） |
| 3 | **查询结果直接渲染** — 不只给文字，还给数据 | AI 消息内嵌结果表格（商品名/销售额/订单数/退货率，退货率高亮红色） |
| 4 | **分析文本含数据洞察** — AI 回答不只是 SQL 结果，还有解读 | 分析气泡：Top 5 商品分析 + ⚠️ 高退货率高亮 + 追问引导 |
| 5 | **右侧上下文面板** — 每轮对话的 Token / 工具 / 耗时透明 | 右栏 4 个区块：使用工具 / 数据源 / Token 消耗 / 耗时 |
| 6 | **左栏推荐提问 + 可用表概览** — 降低用户提问门槛 | 左栏：5 个推荐提问按钮 + 可用表列表（表名+行数+字段数） |

---

## 二、当前实现分析

### 2.1 当前三栏布局

```
┌──────────┬──────────────────────────────┬──────────┐
│ 左 240px  │ 中间 flex-1                   │ 右 280px  │
│           │                               │           │
│ 💡 推荐提问│ ← 返回工作台  ● Schema 已确认  │ 🔧 使用工具│
│ • 本月Top5│                               │ • (工具名列表)│
│ • 各渠道  │                               │             │
│ • 近6月   │ 消息列表（MessageBubble）       │ 📊 数据源   │
│ • 消费最高│                               │ • (dsId 前8位)│
│ • 退货率  │                               │             │
│           │                               │ 📊 本轮工具结果│
│ ❌ 无可用表│                               │ • (结果列表)  │
│ 概览      │                               │             │
│           │                               │ ❌ 无 Token  │
│           │                               │ ❌ 无耗时    │
│           │ [Claude-style composer]       │             │
└──────────┴──────────────────────────────┴──────────┘
```

### 2.2 当前实现的 6 个维度评估

| # | 设计意图 | 当前实现 | 差距 |
|---|---|---|---|
| 1 | 上下文感知 | header 有 badge 但**没有表数/字段数/关系数** | 🟠 缺少 Schema 统计信息 |
| 2 | 工具调用过程可视化 | MessageBubble 有 ThinkProcess 组件展示工具调用时间线 | ✅ 已实现，但**没有 SQL 代码展示** |
| 3 | 查询结果直接渲染 | MessageBubble 渲染 CollapsibleTable + DynamicChart | ✅ 已实现 |
| 4 | 分析文本含数据洞察 | MessageBubble 用 ReactMarkdown 渲染 LLM 文本 | ✅ 已实现 |
| 5 | 右侧上下文面板 | 右栏有工具/数据源/工具结果，但**没有 Token / 耗时** | 🔴 缺少 Token 和耗时 |
| 6 | 左栏推荐提问 + 可用表 | 有推荐提问但**没有可用表概览** | 🟠 缺少可用表列表 |

---

## 三、逐项差距分析

### 差距 1：左栏缺少「可用表」概览

**原型**：
```
🗂️ 可用表
👥 customers — 客户表 · 9 字段
📦 orders — 订单表 · 12 字段
📋 order_items — 明细 · 7 字段
🛍️ products — 商品 · 11 字段
+ 4 张其他表
```

**当前**：左栏只有推荐提问，没有可用表列表。

**根因**：ChatWindow 没有调 `getDatasourceSchema(datasourceId)` 拉取已确认的 Schema 理解。

**影响**：用户提问时不知道有哪些表可用，提问可能超出数据范围。

**修复方案**：
```tsx
// ChatWindow.tsx 左栏加可用表列表
import { getDatasourceSchema } from '../../schema-review/api';

const [schema, setSchema] = useState<SchemaUnderstanding | null>(null);

useEffect(() => {
  if (dsId) {
    getDatasourceSchema(dsId).then(res => setSchema(res.schemaUnderstanding));
  }
}, [dsId]);

// 左栏渲染
<div className="card" style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
  <h3>🗂️ 可用表</h3>
  {schema?.tables.map(t => (
    <div key={t.name}>
      <strong>{t.name}</strong> — {t.columns.length} 字段
    </div>
  ))}
</div>
```

**工作量**：30 分钟

---

### 差距 2：header 缺少 Schema 统计信息

**原型**：
```
● Schema 已确认   基于 8 张表 · 67 字段 · 7 关系
```

**当前**：
```
● Schema 已确认
```

**根因**：ChatWindow 的 header 没有从 schema understanding 计算统计数。

**修复方案**：差距 1 拿到 schema 后，在 header 显示：
```tsx
<span className="badge badge-success">● Schema 已确认</span>
<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
  基于 {schema?.tables.length || 0} 张表 ·{' '}
  {schema?.tables.reduce((sum, t) => sum + t.columns.length, 0) || 0} 字段 ·{' '}
  {schema?.relations?.length || 0} 关系
</span>
```

**工作量**：10 分钟（与差距 1 合并）

---

### 差距 3：工具调用卡片缺少 SQL 代码展示

**原型**：
```
🔧 调用工具：query_data · 执行 SQL
┌─────────────────────────────────────┐
│ SELECT p.name, p.category_id,       │
│   SUM(oi.qty * oi.unit_price) AS sales│
│ FROM order_items oi                  │
│ JOIN orders o ON oi.order_id = o.id  │
│ ...                                  │
│ → 返回 5 行 · 耗时 286ms             │
└─────────────────────────────────────┘
```

**当前**：MessageBubble 的 ThinkProcess 只显示工具名 + 状态（pending/done），**不显示 SQL**。

**根因**：后端 `tool_call` 事件只推 `{id, name, args}`，不推生成的 SQL。SQL 在 `tool_result` 的 `result.sql` 字段里，但 ThinkProcess 不读它。

**修复方案**：

方案 A（推荐，前端改）：在 MessageBubble 的 toolResults 渲染中，对 `query_details` 类型的结果，额外渲染一个可折叠的 SQL 代码块：

```tsx
// MessageBubble.tsx 在 query_details 分支内
{res.name === "query_details" && res.result.rows && (
  <>
    {/* SQL 代码展示（可折叠） */}
    {res.result.sql && (
      <SqlCodeBlock sql={res.result.sql as string} rowCount={res.result.rowCount as number} />
    )}
    {/* 原有的表格渲染 */}
    <CollapsibleTable rows={rows} fieldMapping={...} />
  </>
)}
```

新建 `SqlCodeBlock` 组件：
```tsx
function SqlCodeBlock({ sql, rowCount }: { sql: string; rowCount?: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '6px 10px', background: 'var(--bg-tertiary)', cursor: 'pointer', fontSize: 11, display: 'flex', justifyContent: 'space-between' }}
      >
        <span>🔧 SQL 查询</span>
        <span>{expanded ? '收起' : '展开'} {rowCount != null && `· ${rowCount} 行`}</span>
      </div>
      {expanded && (
        <pre style={{ padding: 10, fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'var(--bg-primary)', margin: 0, overflowX: 'auto' }}>
          <code>{sql}</code>
        </pre>
      )}
    </div>
  );
}
```

**工作量**：30 分钟

---

### 差距 4：右栏缺少 Token 消耗和耗时

**原型**：
```
📊 Token 消耗
输入  4,238
输出  1,856
合计  6,094

⏱️ 耗时
总耗时 8.2s
```

**当前**：右栏有工具列表 / 数据源 / 工具结果，但**没有 Token 和耗时**。

**根因**：后端 SSE 的 `done` 事件没有携带 token 和耗时信息。

**修复方案**：

后端 `chat.service.ts` 在 done 事件中补充统计：
```typescript
// chat.service.ts 在流结束时
const elapsed = Date.now() - startTime;
// 从 LlmService 拿 token 统计（如果 LlmService 有计数器）
const tokenStats = this.aiService.getLastTokenUsage();

subscriber.next({
  type: "done",
  data: {
    session: updatedSession,
    stats: {
      elapsedMs: elapsed,
      inputTokens: tokenStats?.inputTokens ?? 0,
      outputTokens: tokenStats?.outputTokens ?? 0,
      totalTokens: tokenStats?.totalTokens ?? 0,
    },
  },
});
```

前端 ChatWindow 从 done 事件读 stats：
```tsx
onDone: (data) => {
  useChatStore.getState().updateLastAssistant(msg => ({ ...msg, isFinal: true }));
  if (data?.stats) {
    setStats(data.stats);
  }
},

// 右栏渲染
<div>
  <h3>📊 Token 消耗</h3>
  <div>输入 {stats?.inputTokens ?? '—'}</div>
  <div>输出 {stats?.outputTokens ?? '—'}</div>
  <div>合计 {stats?.totalTokens ?? '—'}</div>
</div>
<div>
  <h3>⏱️ 耗时</h3>
  <div>总耗时 {stats ? (stats.elapsedMs / 1000).toFixed(1) + 's' : '—'}</div>
</div>
```

**工作量**：1 小时（后端 30 分钟 + 前端 30 分钟）

---

### 差距 5：datasourceId 链路断裂（已知 bug）

**原型**：用户从 dashboard 点「问 Agent」→ 跳 `/chat/:datasourceId` → 对话基于该数据源。

**当前**：ChatWindow 从 URL 拿到 `datasourceId`，但没有同步到 `useChatStore.selectedDataSourceId`。`sendInCurrentSession` 创建新 session 时用的是 store 里的旧值或 null → 后端报 `NO_DATASOURCE`。

**修复方案**（已在 Fix-14 BUG-003 中描述）：
```tsx
useEffect(() => {
  if (dsId) {
    useChatStore.getState().setSelectedDataSourceId(dsId);
  }
}, [dsId]);
```

**工作量**：5 分钟

---

### 差距 6：推荐提问是静态的，没有基于 Schema 动态生成

**原型**：5 个推荐提问是静态的（"本月销售额 Top 5 商品"等）。

**当前**：同样是 5 个静态提问。

**评估**：原型和当前一致，都是静态。这不是 bug，但如果要优化，可以：
- 根据 Schema 的表名 + 字段角色动态生成推荐提问
- 例如：有 `orders` 表 + `total_amt` 指标字段 → 推荐"本月总销售额是多少？"

**工作量**：2 小时（可选优化，不阻断）

---

## 四、重构方案总结

### 4.1 重构优先级

| 优先级 | 差距 | 描述 | 工作量 |
|---|---|---|---|
| 🔴 P0 | 差距 5 | datasourceId 同步到 chatStore | 5 分钟 |
| 🟠 P1 | 差距 1+2 | 左栏加可用表 + header 加 Schema 统计 | 40 分钟 |
| 🟠 P1 | 差距 4 | 右栏加 Token + 耗时（需后端配合） | 1 小时 |
| 🟡 P2 | 差距 3 | 工具调用卡片加 SQL 代码展示 | 30 分钟 |
| 🟢 P3 | 差距 6 | 推荐提问动态化（可选） | 2 小时 |

**总工作量**：约 2.5 小时（不含 P3）

### 4.2 重构后的目标效果

```
┌──────────┬──────────────────────────────┬──────────┐
│ 左 240px  │ 中间 flex-1                   │ 右 280px  │
│           │                               │           │
│ 💡 推荐提问│ ← 返回工作台                  │ 🔧 使用工具│
│ • 本月Top5│ ● Schema 已确认               │ • query_data│
│ • 各渠道  │   基于 8 张表 · 67 字段 · 7 关系│             │
│ • 近6月   │                               │ 📊 数据源   │
│ • 消费最高│ 用户: 本月Top 5 商品？        │ • ecommerce_db│
│ • 退货率  │                               │             │
│           │ AI: 好的，我会从 order_items... │ 📊 Token 消耗│
│ 🗂️ 可用表  │ ┌─ 🔧 SQL 查询 ─── 5 行 ────┐│ • 输入 4,238│
│ 👥 customers│ │ SELECT p.name, ...        ││ • 输出 1,856│
│ 📦 orders  │ │ → 返回 5 行 · 286ms       ││ • 合计 6,094│
│ 📋 items   │ └────────────────────────────┘│             │
│ 🛍️ products│ ┌─ 📊 查询结果 ──────────────┐│ ⏱️ 耗时     │
│ + 4 张表   │ │ 商品名  销售额  退货率     ││ • 总耗时 8.2s│
│           │ │ 耳机Pro ¥184K  2.1%       ││             │
│           │ │ ...                       ││             │
│           │ └────────────────────────────┘│             │
│           │                               │             │
│           │ 📊 Top 5 商品分析：           ││             │
│           │ • 冠军「耳机Pro」退货率仅 2.1%││             │
│           │ • ⚠️「机械键盘」退货率 7.4%   ││             │
│           │                               │             │
│           │ [基于已确认的Schema，问任何问题]│             │
└──────────┴──────────────────────────────┴──────────┘
```

### 4.3 涉及文件清单

| 文件 | 改动类型 | 内容 |
|---|---|---|
| `apps/web/src/features/chat/components/ChatWindow.tsx` | 修改 | 加 useEffect 同步 dsId / 加左栏可用表 / 加 header 统计 / 加右栏 Token+耗时 |
| `apps/web/src/features/chat/components/MessageBubble.tsx` | 修改 | query_details 结果加 SqlCodeBlock 组件 |
| `apps/web/src/features/chat/components/SqlCodeBlock.tsx` | 新建 | 可折叠 SQL 代码展示组件 |
| `apps/server/src/modules/chat/chat.service.ts` | 修改 | done 事件加 stats（elapsedMs + tokenUsage） |
| `apps/web/src/features/chat/hooks/useSSEChat.ts` | 修改 | onDone 回调读 stats |

### 4.4 不需要改的部分

以下部分当前实现已经足够好，**不需要重构**：

- ✅ `useSSEChat.ts` — eventsource-parser + 指数退避 + AbortController，工程质量高
- ✅ `ChatInput.tsx` — Claude-style composer，自动高度 + 字符计数 + 停止按钮
- ✅ `MessageBubble.tsx` 的 Markdown 渲染 — ReactMarkdown + remarkGfm + 流式光标
- ✅ `MessageBubble.tsx` 的 DynamicChart 渲染 — ECharts + ChartErrorBoundary + 表格降级
- ✅ `MessageBubble.tsx` 的 InsightPanel 渲染 — 结构化洞察卡片
- ✅ `useChatActions.ts` — 会话 CRUD + 乐观更新 + 回滚
- ✅ 后端 `chat.controller.ts` — SSE + traceId + AbortController
- ✅ 后端 `planner.agent.ts` — 动态 Schema + ReAct 循环 + 工具绑定

---

## 五、给 Claude Code 的提示词

```
请按照以下分析文档重构对话追问页，让它更接近原型设计。

═══════════════════════════════════════════
P0：修复 datasourceId 链路（5 分钟）
═══════════════════════════════════════════

文件：apps/web/src/features/chat/components/ChatWindow.tsx

找到 dsId 定义（约 line 33-36），在它后面加：

```tsx
useEffect(() => {
  if (dsId) {
    useChatStore.getState().setSelectedDataSourceId(dsId);
  }
}, [dsId]);
```

验证：grep -c "setSelectedDataSourceId" apps/web/src/features/chat/components/ChatWindow.tsx 应该 ≥ 1

═══════════════════════════════════════════
P1：左栏加可用表 + header 加 Schema 统计（40 分钟）
═══════════════════════════════════════════

文件：apps/web/src/features/chat/components/ChatWindow.tsx

1. 顶部加 import：
import { getDatasourceSchema, type SchemaUnderstanding } from '../../schema-review/api';

2. 在组件内加 state 和 useEffect：
const [schema, setSchema] = useState<SchemaUnderstanding | null>(null);

useEffect(() => {
  if (dsId) {
    getDatasourceSchema(dsId)
      .then(res => setSchema(res.schemaUnderstanding))
      .catch(() => {});
  }
}, [dsId]);

3. 左栏在推荐提问下方加可用表列表：

在 SUGGESTED_QUESTIONS 按钮列表之后，加：

```tsx
<div style={{ marginTop: 16 }}>
  <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    🗂️ 可用表
  </h3>
  {schema?.tables.map(t => (
    <div key={t.name} style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 6 }}>
      <div style={{ color: 'var(--green-dark)', fontWeight: 600 }}>{t.name}</div>
      <div style={{ paddingLeft: 8 }}>{t.columns.length} 字段{t.rowCount ? ` · ${t.rowCount.toLocaleString()} 行` : ''}</div>
    </div>
  ))}
  {!schema && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>加载中...</div>}
</div>
```

4. header 的 Schema 已确认 badge 后面加统计：

找到 `<span className="badge badge-success">● Schema 已确认</span>`，在它后面加：

```tsx
<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
  基于 {schema?.tables.length ?? 0} 张表 ·{' '}
  {schema?.tables.reduce((sum, t) => sum + t.columns.length, 0) ?? 0} 字段 ·{' '}
  {schema?.relations?.length ?? 0} 关系
</span>
```

验证：grep -c "可用表" apps/web/src/features/chat/components/ChatWindow.tsx 应该 ≥ 1
验证：grep -c "SchemaUnderstanding" apps/web/src/features/chat/components/ChatWindow.tsx 应该 ≥ 1

═══════════════════════════════════════════
P1：右栏加 Token + 耗时（1 小时）
═══════════════════════════════════════════

文件：apps/web/src/features/chat/hooks/useSSEChat.ts

1. 修改 DoneEventData 类型，加 stats：
找到 DoneEventData 定义，加：
```typescript
export interface DoneEventData {
  session?: { id: string; title: string; createdAt: string; updatedAt: string } | null;
  stats?: {
    elapsedMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
```

文件：apps/web/src/features/chat/components/ChatWindow.tsx

2. 加 stats state：
```tsx
const [stats, setStats] = useState<{ elapsedMs: number; inputTokens: number; outputTokens: number; totalTokens: number } | null>(null);
```

3. 在 onDone 回调中读 stats：
```tsx
onDone: (data) => {
  useChatStore.getState().updateLastAssistant((msg) => ({ ...msg, isFinal: true }));
  if (data?.stats) {
    setStats(data.stats);
  }
},
```

4. 右栏在"本轮工具结果"之后加：

```tsx
<div style={{ marginBottom: 16 }}>
  <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    📊 Token 消耗
  </h3>
  {stats ? (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>输入</span><span className="num">{stats.inputTokens.toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>输出</span><span className="num">{stats.outputTokens.toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border-light)', marginTop: 4 }}>
        <span style={{ fontWeight: 600 }}>合计</span><span className="num" style={{ color: 'var(--green-dark)', fontWeight: 600 }}>{stats.totalTokens.toLocaleString()}</span>
      </div>
    </div>
  ) : (
    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>
  )}
</div>

<div style={{ marginBottom: 16 }}>
  <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    ⏱️ 耗时
  </h3>
  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
    {stats ? `${(stats.elapsedMs / 1000).toFixed(1)}s` : '—'}
  </div>
</div>
```

验证：grep -c "Token 消耗\|耗时" apps/web/src/features/chat/components/ChatWindow.tsx 应该 ≥ 2

═══════════════════════════════════════════
P2：工具调用卡片加 SQL 代码展示（30 分钟）
═══════════════════════════════════════════

新建文件：apps/web/src/features/chat/components/SqlCodeBlock.tsx

```tsx
import { useState } from 'react';

export function SqlCodeBlock({ sql, rowCount, elapsedMs }: { sql: string; rowCount?: number; elapsedMs?: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '6px 10px',
          background: 'var(--bg-tertiary)',
          cursor: 'pointer',
          fontSize: 11,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text-secondary)',
          fontWeight: 600,
        }}
      >
        <span>🔧 SQL 查询</span>
        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
          {expanded ? '收起' : '展开'}
          {rowCount != null && ` · ${rowCount} 行`}
          {elapsedMs != null && ` · ${elapsedMs}ms`}
        </span>
      </div>
      {expanded && (
        <pre style={{
          padding: 10,
          fontSize: 11,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          background: 'var(--bg-primary)',
          margin: 0,
          overflowX: 'auto',
          fontFamily: '"SF Mono", Menlo, monospace',
        }}>
          <code>{sql}</code>
        </pre>
      )}
    </div>
  );
}

export default SqlCodeBlock;
```

文件：apps/web/src/features/chat/components/MessageBubble.tsx

在 query_details 分支（搜索 `res.name === "query_details"`），在 CollapsibleTable 之前加：

```tsx
import SqlCodeBlock from './SqlCodeBlock';

// 在 query_details 的 return 内，CollapsibleTable 之前：
{res.result.sql && (
  <SqlCodeBlock
    sql={res.result.sql as string}
    rowCount={res.result.rowCount as number}
  />
)}
```

验证：test -f apps/web/src/features/chat/components/SqlCodeBlock.tsx && echo "✓" || echo "✗"
验证：grep -c "SqlCodeBlock" apps/web/src/features/chat/components/MessageBubble.tsx 应该 ≥ 1

═══════════════════════════════════════════
全部完成后
═══════════════════════════════════════════

1. tsc --noEmit 确认编译通过
2. 列出所有修改的文件
```

---
*AI生成*
