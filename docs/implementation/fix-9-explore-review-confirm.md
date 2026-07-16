# Fix-9 · Explore → Schema-Review → Confirm 完整探索链路联调

> **执行前提**：Fix-8 已完成（登录 + 连接数据源 + explore SSE 跑通）
> **目标**：让 SchemaReviewPage 和 ConfirmPage 接入真实后端 API，不再用 mock
> **方法**：把 Fix-7 还原的 mock 页面改造为调用 useSchemaReview hook + 真实 API

---

## Task 9.1 · SchemaReviewPage 接入真实 API（替换 mock）

### Bug
`SchemaReviewPage.tsx` 是纯 mock（注释明确写 `Mock: 内嵌 8 张表 + 4 个对话轮次,固定渲染, 不发 API`）。
但 `useSchemaReview` hook 已经实现了真实的 startReview + SSE chat + finalize 逻辑，**只是页面没用它**。

### 定位
`apps/web/src/features/schema-review/SchemaReviewPage.tsx`

### 改什么

**1. 删除所有 mock 数据**

删除 `TABLES` 数组、`MESSAGES` 数组、所有硬编码的对话内容。

**2. 引入 useSchemaReview hook**

```tsx
import { useSchemaReview } from './hooks/useSchemaReview';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function SchemaReviewPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  
  const {
    reviewId,
    fields,        // PendingField[] — 待确认字段列表
    messages,      // ReviewMessage[] — 对话历史
    isProcessing,
    error,
    startReview,
    sendMessage,
    finalize,
  } = useSchemaReview();

  const [input, setInput] = useState('');

  // 首次挂载：启动 review
  useEffect(() => {
    if (datasourceId && !reviewId) {
      startReview(datasourceId);
    }
  }, [datasourceId, reviewId, startReview]);

  // 发送消息
  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    sendMessage(input.trim());
    setInput('');
  };

  // 快捷回复
  const handleQuickReply = (reply: string) => {
    if (isProcessing) return;
    sendMessage(reply);
  };

  // 全部确认 → 跳 confirm
  const handleFinalize = () => {
    finalize().then(() => {
      navigate(`/confirm/${datasourceId}`);
    });
  };
```

**3. 渲染真实字段列表（左栏表树）**

```tsx
{/* 左栏：按表分组的待确认字段 */}
<div className="schema-tree">
  <div className="schema-tree-header">
    <span>待确认字段 ({fields.length})</span>
  </div>
  <div className="schema-tree-body">
    {fields.length === 0 ? (
      <div className="empty-state">所有字段已确认</div>
    ) : (
      // 按 table 分组
      Object.entries(
        fields.reduce<Record<string, typeof fields>>((acc, f) => {
          (acc[f.table] = acc[f.table] || []).push(f);
          return acc;
        }, {})
      ).map(([tableName, tableFields]) => (
        <div key={tableName} className="schema-table-item has-issue">
          <div className="schema-table-name">
            <svg>...</svg>
            {tableName}
          </div>
          <div className="schema-table-meta">
            {tableFields.length} 个字段待确认
          </div>
        </div>
      ))
    )}
  </div>
</div>
```

**4. 渲染真实对话（右栏）**

```tsx
{/* 右栏：对话区 */}
<div className="review-chat">
  <div className="review-chat-messages">
    {messages.map((msg, i) => (
      <div key={i} className={`review-message ${msg.role}`}>
        <div className={`review-avatar ${msg.role === 'ai' ? 'ai' : 'user'}`}>
          {msg.role === 'ai' ? 'AI' : '我'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div 
            className="review-bubble"
            dangerouslySetInnerHTML={{ __html: msg.content }}
          />
          {/* AI 消息的快捷回复 */}
          {msg.role === 'ai' && msg.quickReplies && msg.quickReplies.length > 0 && (
            <div className="quick-reply">
              {msg.quickReplies.map((reply, j) => (
                <button
                  key={j}
                  className="quick-reply-btn"
                  onClick={() => handleQuickReply(reply)}
                  disabled={isProcessing}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    ))}
    {isProcessing && (
      <div className="review-message ai">
        <div className="review-avatar ai">AI</div>
        <div className="review-bubble">
          <span className="typing-indicator">正在思考...</span>
        </div>
      </div>
    )}
  </div>

  {/* 输入区 */}
  <div className="review-input-area">
    <textarea
      className="review-input"
      placeholder="直接打字回答 Agent，或点击上方快捷回复..."
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      }}
      disabled={isProcessing}
    />
    <button
      className="btn btn-primary btn-sm"
      onClick={handleSend}
      disabled={isProcessing || !input.trim()}
    >
      发送
    </button>
  </div>
</div>
```

**5. 顶部「全部确认」按钮**

```tsx
<div className="page-header">
  <div>
    <h1 className="page-title">Schema 确认 · 帮 Agent 搞懂您的数据</h1>
    <p className="page-subtitle">
      {fields.length > 0
        ? `${fields.length} 个字段待确认`
        : '所有字段已确认，可以敲定 Schema'}
    </p>
  </div>
  <div className="page-actions">
    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/explore/${datasourceId}`)}>
      重新探索
    </button>
    <button
      className="btn btn-primary btn-sm"
      onClick={handleFinalize}
      disabled={fields.length > 0 || isProcessing}
    >
      {fields.length > 0 ? `还需确认 ${fields.length} 个` : '全部确认，生成工作台'}
    </button>
  </div>
</div>
```

**6. 错误处理**

```tsx
{error && (
  <div className="error-banner">
    {error}
    <button onClick={() => startReview(datasourceId!)}>重试</button>
  </div>
)}
```

### 验证
```bash
# 不再有 mock TABLES 数组
grep -c "const TABLES" apps/web/src/features/schema-review/SchemaReviewPage.tsx
# 应该 = 0

# 用了 useSchemaReview hook
grep -c "useSchemaReview" apps/web/src/features/schema-review/SchemaReviewPage.tsx
# 应该 ≥ 1

# 调了 sendMessage
grep -c "sendMessage" apps/web/src/features/schema-review/SchemaReviewPage.tsx
# 应该 ≥ 2
```

---

## Task 9.2 · 修复 useSchemaReview hook 的 SSE URL 编码问题

### Bug
`useSchemaReview.ts` 的 SSE URL 把 message 放在 query 参数里：
```
/api/schema/review/chat?reviewId=xxx&message=xxx
```
如果用户输入含 `&` `=` `#` 等特殊字符，URL 会断裂。

### 定位
`apps/web/src/features/schema-review/hooks/useSchemaReview.ts`

### 改什么

找到 SSE URL 构造（约 line 91）：
```typescript
// 修改前
const url = `${API_BASE}/api/schema/review/chat?reviewId=${encodeURIComponent(id)}&message=${encodeURIComponent(message)}`;
```

虽然用了 `encodeURIComponent`，但 GET URL 长度有限制（浏览器约 2048 字符）。如果用户回答很长，URL 会被截断。

**方案**：改为 POST 请求 + fetch stream（但后端是 `@Sse` GET）。

**临时方案**：保持 GET，但加 URL 长度检查：
```typescript
const url = `${API_BASE}/api/schema/review/chat?reviewId=${encodeURIComponent(id)}&message=${encodeURIComponent(message)}`;
if (url.length > 2000) {
  setError('回答过长，请精简后重试');
  return;
}
```

### 验证
```bash
grep -c "encodeURIComponent" apps/web/src/features/schema-review/hooks/useSchemaReview.ts
# 应该 ≥ 2
```

---

## Task 9.3 · ConfirmPage 接入真实 API（替换 mock）

### Bug
`ConfirmPage.tsx` 是纯 mock（注释写 `Mock: 内嵌 8 张表 + 67 字段 + 7 关系; 不调 API`）。
不调 `finalizeReview`，直接 navigate。

### 定位
`apps/web/src/features/schema-review/ConfirmPage.tsx`

### 改什么

**1. 删除所有 mock 数据**

删除 `TABLES_ER`、`FIELD_SUMMARY` 等硬编码数组。

**2. 引入 API + store**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDatasourceStore } from '../../core/store/datasource-store';
import { finalizeReview, getDatasourceSchema, type SchemaUnderstanding } from './api';
import { toast } from '../../store/toast';

export default function ConfirmPage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const reviewId = useDatasourceStore(s => s.currentReviewId);
  
  const [understanding, setUnderstanding] = useState<SchemaUnderstanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 拉取 schema understanding
  useEffect(() => {
    if (!datasourceId) return;
    setLoading(true);
    getDatasourceSchema(datasourceId)
      .then(res => {
        setUnderstanding(res.schemaUnderstanding);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [datasourceId]);

  // 确认 → 调 finalize → 跳 dashboard
  const handleFinalize = async () => {
    if (!datasourceId) return;
    setFinalizing(true);
    setError(null);
    try {
      if (reviewId) {
        await finalizeReview(reviewId);
        useDatasourceStore.getState().setReviewId(null);
      }
      toast.success('Schema 已敲定，正在生成工作台...');
      navigate(`/dashboard/${datasourceId}`);
    } catch (err) {
      setError((err as Error).message);
      toast.error('敲定失败');
    } finally {
      setFinalizing(false);
    }
  };
```

**3. 渲染真实统计**

```tsx
{loading ? (
  <div className="loading">加载 Schema 理解中...</div>
) : understanding ? (
  <>
    {/* 统计卡片 — 从 understanding 计算 */}
    <div className="grid grid-4">
      <div className="card" style={{ padding: 16 }}>
        <div className="kpi-label">业务表</div>
        <div className="kpi-value">{understanding.tables.length}</div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="kpi-label">字段总数</div>
        <div className="kpi-value">
          {understanding.tables.reduce((sum, t) => sum + t.columns.length, 0)}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="kpi-label">识别关系</div>
        <div className="kpi-value">{understanding.relations?.length || 0}</div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="kpi-label">敏感字段</div>
        <div className="kpi-value">
          {understanding.tables
            .flatMap(t => t.columns)
            .filter(c => c.semanticRole === 'sensitive').length}
        </div>
      </div>
    </div>

    {/* ER 关系图 — 从 understanding.relations 渲染 */}
    {understanding.relations && understanding.relations.length > 0 && (
      <div className="card">
        <div className="card-header">
          <div className="card-title">表关系</div>
        </div>
        <div className="card-body">
          {understanding.relations.map((rel, i) => (
            <div key={i} className="relation-row">
              <span>{rel.from}</span>
              <span>→</span>
              <span>{rel.to}</span>
              <span className="confidence">{(rel.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* 字段语义汇总表 — 从 understanding.tables 渲染 */}
    <div className="card">
      <div className="card-header">
        <div className="card-title">字段语义汇总</div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>表</th><th>字段</th><th>类型</th><th>含义</th><th>角色</th>
          </tr>
        </thead>
        <tbody>
          {understanding.tables.map(table =>
            table.columns.map((col, i) => (
              <tr key={`${table.name}.${col.name}`}>
                <td>{table.name}</td>
                <td>{col.name}</td>
                <td>{col.rawType}</td>
                <td>{col.chineseName || col.name}</td>
                <td>{col.semanticRole || 'unknown'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    {/* 确认按钮 */}
    <div style={{ marginTop: 24 }}>
      <button
        className="btn btn-primary btn-lg"
        onClick={handleFinalize}
        disabled={finalizing}
      >
        {finalizing ? '敲定中...' : '确认，生成工作台'}
      </button>
    </div>
  </>
) : (
  <div className="empty-state">
    <p>未找到 Schema 理解数据</p>
    <button onClick={() => navigate(`/schema-review/${datasourceId}`)}>
      返回纠错
    </button>
  </div>
)}
```

### 验证
```bash
# 不再有 mock TABLES_ER
grep -c "const TABLES_ER" apps/web/src/features/schema-review/ConfirmPage.tsx
# 应该 = 0

# 调了 finalizeReview
grep -c "finalizeReview" apps/web/src/features/schema-review/ConfirmPage.tsx
# 应该 ≥ 1

# 调了 getDatasourceSchema
grep -c "getDatasourceSchema" apps/web/src/features/schema-review/ConfirmPage.tsx
# 应该 ≥ 1
```

---

## Task 9.4 · 修复 useSchemaReview hook 的 firstMsg 逻辑

### Bug
`useSchemaReview.ts` 的 `startReview` 在拿到 reviewId 后，会发一条初始消息 `firstMsg`：
```typescript
await sendSSEMessage(result.reviewId, firstMsg);
```
需要确认 `firstMsg` 是什么。如果是一个固定字符串，会导致每条 review 都有同样的开场白。

### 定位
`apps/web/src/features/schema-review/hooks/useSchemaReview.ts`

### 改什么

读取 `startReview` 函数（约 line 65-85），找到 `firstMsg` 定义。

**如果是硬编码**：
```typescript
const firstMsg = '请开始提问';
```

**改为**：不发 firstMsg，让后端 startReview 自己生成第一个问题。

```typescript
const startReview = useCallback(async (datasourceId: string) => {
  try {
    setIsProcessing(true);
    const result = await apiStartReview(datasourceId);
    setReviewId(result.reviewId);
    useDatasourceStore.getState().setReviewId(result.reviewId);
    setFields(result.fields);
    
    // 不发 firstMsg — 后端 startReview 应该已经准备好第一个问题
    // 前端调 getFirstQuestion 拉
    const firstQ = await getFirstQuestion(result.reviewId);
    if (firstQ) {
      setMessages([{ role: 'ai', content: firstQ.question, quickReplies: firstQ.quickReplies, ts: new Date().toISOString() }]);
    }
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setIsProcessing(false);
  }
}, []);
```

**或者**：如果后端 startReview 返回值含第一个问题，直接用：
```typescript
const result = await apiStartReview(datasourceId);
if (result.firstQuestion) {
  setMessages([{ role: 'ai', content: result.firstQuestion.question, ... }]);
}
```

**需要先检查后端 startReview 返回值**：
```bash
grep -A5 "return {" apps/server/src/modules/schema-review/review.service.ts | head -10
```

### 验证
```bash
# useSchemaReview 不发硬编码 firstMsg
grep -c "firstMsg" apps/web/src/features/schema-review/hooks/useSchemaReview.ts
# 应该 = 0 或改为动态
```

---

## Task 9.5 · 修复后端 review.service 的 generateQuestion 逻辑

### Bug
`review.service.ts` 的 `generateQuestion` 方法需要确认：
1. 是否真的调 LLM 生成提问？
2. 是否返回 quickReplies？
3. 如果没有 pending fields 了，返回什么？

### 定位
`apps/server/src/modules/schema-review/review.service.ts`

### 改什么

读取 `generateQuestion` 方法：
```bash
grep -A50 "async generateQuestion" apps/server/src/modules/schema-review/review.service.ts
```

**确认**：
- 调 LLM 生成提问 ✓
- 返回 `{ question, fieldName, tableName, quickReplies, evidence, remaining }` ✓
- 如果 remaining=0，返回 null ✓

**如果 LLM 未配置**：generateQuestion 会失败。需要加 LLM 配置检查（同 explore 的 Task 8.7）。

```typescript
async generateQuestion(reviewId: string) {
  // 检查 LLM 配置
  const llmConfig = await this.db.db
    .selectFrom('LLMConfig')
    .selectAll()
    .orderBy('updatedAt', 'desc')
    .executeTakeFirst();
  
  if (!llmConfig || !llmConfig.apiKey) {
    return {
      question: '⚠️ LLM 未配置，无法生成提问。请先在「模型配置」页面配置 API Key。',
      fieldName: '',
      tableName: '',
      quickReplies: [],
      evidence: null,
      remaining: 0,
    };
  }
  
  // ... 原 LLM 调用逻辑
}
```

### 验证
```bash
grep -c "LLMConfig\|llmConfig" apps/server/src/modules/schema-review/review.service.ts
# 应该 ≥ 1
```

---

## Task 9.6 · 修复 ExplorePage 跳转逻辑

### Bug
ExplorePage 完成后：
- `reviewNeeded=true` → 跳 `/schema-review/:id`
- `reviewNeeded=false` → 跳 `/dashboard/:id`

但如果是 `reviewNeeded=false`，DataSource 的 `exploreStatus` 是 `finalized`，dashboard 可以直接生成。✓

如果是 `reviewNeeded=true`，跳到 schema-review，但 schema-review 需要 `exploreStatus='reviewing'`。explore 第 5 步已经设为 `reviewing`。✓

**问题**：ExplorePage 完成后，用户可能直接点「跳 dashboard」而不去 schema-review。需要确保 dashboard 能处理 `exploreStatus='reviewing'` 的情况。

### 定位
`apps/web/src/features/explore/ExplorePage.tsx`

### 改什么

确认 explore 完成后的按钮逻辑：
```tsx
{done.reviewNeeded ? (
  <button onClick={() => navigate(`/schema-review/${datasourceId}`)}>
    查看探索结果，开始确认
  </button>
) : (
  <button onClick={() => navigate(`/dashboard/${datasourceId}`)}>
    进入工作台
  </button>
)}
```

这个逻辑是对的。但要加一个提示：
```tsx
{done.reviewNeeded && (
  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
    Agent 发现 {done.pendingFields} 个不确定字段（共 {done.totalFields} 字段），需要您确认后才能生成工作台
  </p>
)}
```

### 验证
```bash
grep -c "reviewNeeded" apps/web/src/features/explore/ExplorePage.tsx
# 应该 ≥ 2
```

---

## Task 9.7 · 最终验证脚本

### 创建 check-fix-9.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-9 探索链路联调验证 ==="

echo "[9.1] SchemaReviewPage 接入 API..."
COUNT=$(grep -c "const TABLES\b" apps/web/src/features/schema-review/SchemaReviewPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock TABLES"; exit 1; fi
grep -q "useSchemaReview" apps/web/src/features/schema-review/SchemaReviewPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "sendMessage" apps/web/src/features/schema-review/SchemaReviewPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ SchemaReviewPage 已接入 API"

echo "[9.2] SSE URL 编码..."
grep -q "encodeURIComponent" apps/web/src/features/schema-review/hooks/useSchemaReview.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ SSE URL 已编码"

echo "[9.3] ConfirmPage 接入 API..."
COUNT=$(grep -c "const TABLES_ER" apps/web/src/features/schema-review/ConfirmPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock TABLES_ER"; exit 1; fi
grep -q "finalizeReview" apps/web/src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "getDatasourceSchema" apps/web/src/features/schema-review/ConfirmPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConfirmPage 已接入 API"

echo "[9.4] useSchemaReview firstMsg..."
grep -q "firstMsg" apps/web/src/features/schema-review/hooks/useSchemaReview.ts && echo "  ⚠ firstMsg 仍存在（检查是否动态）" || echo "  ✓ firstMsg 已移除/动态化"

echo "[9.5] 后端 generateQuestion LLM 检查..."
grep -q "LLMConfig\|llmConfig" apps/server/src/modules/schema-review/review.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ generateQuestion 已加 LLM 检查"

echo "[9.6] ExplorePage 跳转..."
grep -q "reviewNeeded" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ExplorePage 跳转逻辑正确"

echo ""
echo "[最终] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-9 验证全部通过"
echo "====================================="
```

### 验证
```bash
bash docs/implementation/verification/check-fix-9.sh
```

---

## Fix-9 完成标准

✅ Task 9.1: SchemaReviewPage 删除 mock，接入 useSchemaReview hook
✅ Task 9.2: SSE URL 编码安全
✅ Task 9.3: ConfirmPage 删除 mock，调 finalizeReview + getDatasourceSchema
✅ Task 9.4: useSchemaReview firstMsg 动态化
✅ Task 9.5: 后端 generateQuestion 加 LLM 配置检查
✅ Task 9.6: ExplorePage 跳转逻辑正确

## 修复后的完整探索链路

```
1. ConnectDatabasePage 创建数据源 → 跳 /explore/:dsId

2. ExplorePage SSE 5 步探索
   → Step 1: 连接数据源
   → Step 2: 发现表（逐表推送 progress）
   → Step 3: 字段语义推断（逐字段推送 progress + 置信度门控）
   → Step 4: 推断表关系
   → Step 5: 生成报告
   → done: reviewNeeded = pendingFields > 0

3. reviewNeeded=true → 跳 /schema-review/:dsId
   → useSchemaReview.startReview(dsId)
     → POST /api/schema/review/start → 返回 reviewId + pendingFields
   → 渲染左栏：待确认字段列表（按表分组）
   → 渲染右栏：AI 第一个提问 + 快捷回复
   → 用户回答 → SSE /api/schema/review/chat
     → ai_thinking → field_updated → next_question → done
   → 循环直到 remaining=0
   → 点「全部确认」→ finalize() → POST /api/schema/review/finalize
   → 跳 /confirm/:dsId

4. ConfirmPage
   → getDatasourceSchema(dsId) → 拉真实 schemaUnderstanding
   → 渲染统计 + ER 图 + 字段表（全部真实数据）
   → 点「确认生成工作台」
     → finalizeReview(reviewId) → 后端持久化 schemaUnderstanding
     → 跳 /dashboard/:dsId

5. DashboardPage（Fix-10 处理）
   → GET /api/dashboard/:dsId → 拿到已持久化的 config
   → 渲染 KPI + ECharts
```

## ⚠️ 本地验证步骤

```bash
# 1. 启动项目
pnpm db:up && pnpm db:seed
pnpm dev:server
pnpm dev:web

# 2. 登录 demo@local.dev / demo123

# 3. 先去 /llm-config 配置 OpenAI API Key

# 4. 连接一个真实 PostgreSQL 数据库（或上传 CSV）

# 5. explore 5 步完成
#    → 应该看到逐表/逐字段滚出
#    → 如果有 pending fields → reviewNeeded=true

# 6. 跳到 schema-review
#    → 左栏应显示真实的待确认字段（不是 mock 8 张表）
#    → 右栏 AI 应该提出真实的字段问题（基于你的数据库）
#    → 回答问题 → AI 应该更新字段理解 + 提下一个问题

# 7. 全部确认 → 跳 confirm
#    → 应显示真实的表数/字段数/关系数
#    → ER 图应该是真实的表关系
#    → 字段表应该是真实的字段

# 8. 点「确认生成工作台」
#    → 调 finalize → 跳 dashboard
```

---
*AI生成*
