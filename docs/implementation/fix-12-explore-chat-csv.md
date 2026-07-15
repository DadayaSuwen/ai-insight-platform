# Fix-12 · 修复 Explore 假数据 + Chat 连接超时 + CSV 上传

> **用户反馈 3 个问题**：
> 1. explore 页面是假的（mock setInterval），不知道成功还是失败
> 2. chat 对话报 `Connection terminated due to connection timeout`
> 3. 上传 CSV 文件全是静态不能正常使用

---

## Task 12.1 · 【P0】ExplorePage 接入真实 SSE（删除 mock）

### Bug
`ExplorePage.tsx` 用 `MOCK_PROGRESS` + `setInterval` 模拟探索，**完全不调真实后端 SSE**。
注释明确写 `Mock: setInterval 逐条推 MOCK_PROGRESS, 每条触发卡片渲染与 logs 追加`。

`useSSEExplore` hook 已实现真实 SSE 调用，但 ExplorePage **没用它**（grep `useSSEExplore` count = 0）。

### 定位
`apps/web/src/features/explore/ExplorePage.tsx`

### 改什么

**1. 删除所有 mock**

删除 `MOCK_PROGRESS` 数组、`MockProgressItem` interface、`setInterval` 逻辑。

**2. 接入 useSSEExplore hook**

```tsx
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, RotateCw } from 'lucide-react';
import { useSSEExplore, type ProgressItem } from './hooks/useSSEExplore';

const STEP_LABELS: Record<number, string> = {
  1: '连接数据源',
  2: '发现表与统计信息',
  3: '分析字段语义（LLM 推断中）',
  4: '推断表关系与外键',
  5: '生成 Schema 理解报告 · 等待您确认',
};

export default function ExplorePage() {
  const { datasourceId } = useParams<{ datasourceId: string }>();
  const navigate = useNavigate();
  const { steps, progressItems, done, error, isRunning, logs, startExplore, abort } = useSSEExplore();
  const startedRef = useRef(false);

  // 首次挂载：自动启动探索
  useEffect(() => {
    if (datasourceId && !startedRef.current) {
      startedRef.current = true;
      startExplore(datasourceId);
    }
    return () => abort();
  }, [datasourceId, startExplore, abort]);

  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const totalSteps = 5;
  const progress = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="explore-page">
      {/* 标题 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
          {isRunning ? 'Agent 正在自主探索' : done ? '探索完成' : error ? '探索出错' : '准备探索'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {datasourceId} · 预计 30-60 秒
        </p>
      </div>

      {/* 进度条 */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>总进度</span>
          <span className="num" style={{ fontSize: 13, color: 'var(--green-dark)', fontWeight: 600 }}>
            {progress}% · 第 {Math.min(completedSteps + 1, 5)}/{totalSteps} 步
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 4,
              transition: 'width 0.5s',
              background: error ? 'var(--error)' : 'linear-gradient(90deg, var(--green), var(--green-dark))',
            }}
          />
        </div>
      </div>

      {/* 步骤时间线 — 真实 SSE 数据 */}
      <div className="card" style={{ padding: '0 24px' }}>
        {steps.map((s) => (
          <StepRow key={s.step} step={s} progressItems={progressItems.filter(p => p.step === s.step)} />
        ))}
      </div>

      {/* 日志面板 — 真实 SSE logs */}
      <div
        className="num"
        style={{
          marginTop: 20,
          background: '#1e293b',
          borderRadius: 12,
          padding: '16px 20px',
          fontSize: 11,
          lineHeight: 1.8,
          color: '#94a3b8',
          maxHeight: 200,
          overflowY: 'auto',
          fontFamily: '"SF Mono", Menlo, monospace',
        }}
      >
        {logs.length === 0 && <div style={{ color: '#64748b' }}>等待连接...</div>}
        {logs.map((line, i) => (
          <div key={i} style={{ color: line.includes('✓') ? '#5BA888' : line.includes('❌') ? '#C97064' : line.includes('⏳') ? '#D4A06D' : '#94a3b8' }}>
            {line}
          </div>
        ))}
      </div>

      {/* 操作区 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        {isRunning && (
          <button className="btn btn-secondary btn-lg" onClick={abort}>
            <RotateCw size={16} /> 停止探索
          </button>
        )}
        {done && !isRunning && (
          <div>
            {done.reviewNeeded ? (
              <button className="btn btn-primary btn-lg" onClick={() => navigate(`/schema-review/${datasourceId}`)}>
                查看探索结果，开始确认 <ArrowRight size={16} />
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={() => navigate(`/dashboard/${datasourceId}`)}>
                进入工作台 <ArrowRight size={16} />
              </button>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {done.reviewNeeded
                ? `Agent 发现 ${done.pendingFields} 个不确定字段（共 ${done.totalFields} 字段），需要您确认`
                : `全部 ${done.totalFields} 个字段已自动确认，可直接生成工作台`}
            </p>
          </div>
        )}
        {error && (
          <div>
            <p style={{ marginBottom: 16, fontSize: 14, color: 'var(--error)' }}>探索失败: {error}</p>
            {error.includes('LLM_NOT_CONFIGURED') && (
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/llm-config')}>
                去配置 LLM API Key
              </button>
            )}
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => {
                startedRef.current = false;
                if (datasourceId) startExplore(datasourceId);
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step, progressItems }: { step: ExploreStep; progressItems: ProgressItem[] }) {
  const isDone = step.status === 'done';
  const isActive = step.status === 'active';
  const isError = step.status === 'error';
  const stepState = isDone ? 'done' : isActive ? 'active' : isError ? 'active' : 'pending';

  return (
    <div className={`explore-step ${stepState}`}>
      <div className="explore-step-icon">
        {isDone ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : isActive ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : isError ? (
          '✗'
        ) : (
          step.step
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div className="explore-step-title">{STEP_LABELS[step.step] || step.name}</div>
        {step.detail && (
          <div className="explore-step-desc" style={{ color: isError ? 'var(--error)' : undefined }}>
            {step.detail}
          </div>
        )}
        {/* 渲染该步骤的细粒度进度 — 真实 SSE progressItems */}
        {progressItems.map((p, i) => {
          if (p.type === 'table_discovered') {
            const d = p.data as { name: string; rowCount: number; columnCount: number };
            return (
              <div key={i} className="explore-step-detail" style={{ animation: 'slideIn 0.3s ease-out' }}>
                <span style={{ color: 'var(--green-dark)' }}>▸</span>{' '}
                <strong>{d.name}</strong> ({d.rowCount.toLocaleString()} 行 · {d.columnCount} 列)
              </div>
            );
          }
          if (p.type === 'field_analyzed') {
            const d = p.data as { table: string; field: string; inferredMeaning: string; role: string; confidence: number; needsConfirmation: boolean };
            const color = d.needsConfirmation ? 'var(--amber)' : 'var(--green-dark)';
            const icon = d.needsConfirmation ? '⏳' : '✓';
            return (
              <div key={i} className="explore-step-detail" style={{ color, animation: 'slideIn 0.3s ease-out' }}>
                {icon} {d.table}.{d.field} → {d.inferredMeaning} ({d.role}, 置信度 {d.confidence})
              </div>
            );
          }
          if (p.type === 'relation_inferred') {
            const d = p.data as { fromTable: string; fromField: string; toTable: string; toField: string; confidence: number };
            return (
              <div key={i} className="explore-step-detail" style={{ animation: 'slideIn 0.3s ease-out' }}>
                <span style={{ color: 'var(--green-dark)' }}>→</span>{' '}
                {d.fromTable}.{d.fromField} → {d.toTable}.{d.toField} (置信度 {d.confidence})
              </div>
            );
          }
          return null;
        })}
      </div>
      <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
        {step.elapsedMs != null ? `${(step.elapsedMs / 1000).toFixed(1)}s` : ''}
      </span>
    </div>
  );
}
```

**3. 在 index.css 加 slideIn 动画**

```css
/* 追加到 apps/web/src/index.css 末尾 */
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
```

### 验证
```bash
grep -c "MOCK_PROGRESS\|setInterval" apps/web/src/features/explore/ExplorePage.tsx
# 应该 = 0

grep -c "useSSEExplore" apps/web/src/features/explore/ExplorePage.tsx
# 应该 ≥ 1

grep -c "slideIn" apps/web/src/index.css
# 应该 ≥ 1
```

---

## Task 12.2 · 【P0】修复 Chat 连接超时（Connection terminated due to connection timeout）

### Bug
用户在 chat 页提问「各渠道订单分布如何？」，后端报错：
```
Connection terminated due to connection timeout
```

### 根因分析

`pg.executor.ts` 的 Pool 配置：
```typescript
this.pool = new Pool({
  connectionTimeoutMillis: 5_000,  // 连接建立超时 5 秒
  // 缺少 idleTimeoutMillis 和 query timeout
});
```

问题：
1. **`connectionTimeoutMillis: 5_000`** 只管"建立连接"超时，不管查询执行超时
2. **缺少 `idleTimeoutMillis`** — 空闲连接不会被回收，长时间不用后连接被服务端断开，下次用就报 `Connection terminated`
3. **缺少 statement_timeout** — 如果查询慢，会一直挂着

另外，`ExecutorFactory` 用 `Map<dataSourceId, DataSourceExecutor>` 缓存 executor，如果数据源连接的外部 PG 不稳定或网络有波动，缓存的连接会变成"僵尸连接"。

### 定位
`apps/server/src/modules/datasource/executors/pg.executor.ts`

### 改什么

**1. 优化 Pool 配置**

找到 `new Pool({...})`（约 line 39-48），修改为：

```typescript
this.pool = new Pool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  ssl: config.ssl,
  max: poolSize,
  connectionTimeoutMillis: 10_000,   // 建立连接超时 10s（从 5s 提升）
  idleTimeoutMillis: 30_000,         // 【新增】空闲 30s 后回收连接，避免僵尸连接
  allowExitOnIdle: false,            // 不允许空闲时退出进程
});

// 【新增】设置 statement_timeout — 单条查询最多 60s
this.kysely = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool: this.pool }),
  log: ['error'],
});
```

**2. 在连接建立后设置 statement_timeout**

在 constructor 末尾加：

```typescript
// 设置 statement_timeout 和 idle_in_transaction_session_timeout
this.kysely.executeQuery(
  sql`SET statement_timeout = 60000`.compile(this.kysely)
).catch(() => {}); // 忽略失败（某些 DB 不支持）

this.kysely.executeQuery(
  sql`SET idle_in_transaction_session_timeout = 60000`.compile(this.kysely)
).catch(() => {});
```

或者更简单的方式 — 在 `executeRaw` 方法中加超时：

```typescript
async executeRaw(sqlString: string): Promise<QueryResult> {
  try {
    // 加 60s 查询超时
    const result = await Promise.race([
      this.kysely.executeQuery(sql.raw(sqlString)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('查询超时（60s）')), 60_000)
      ),
    ]);
    // ...
  } catch (err) {
    // 如果是连接断开，清缓存重建
    if (err.message.includes('Connection terminated') || err.message.includes('timeout')) {
      this.logger.warn(`连接断开，清理缓存: ${err.message}`);
      this.factory.evict(this.dataSourceId); // 需要注入 factory 或用回调
    }
    throw err;
  }
}
```

**3. healthCheck 失败时清缓存**

修改 `ExecutorFactory.create`，在返回缓存的 executor 前先做轻量健康检查：

```typescript
create(dataSourceId: string, config: ConnectionConfig): DataSourceExecutor {
  const existing = this.pool.get(dataSourceId);
  if (existing) {
    // 检查连接是否还活着（不阻塞，失败就重建）
    existing.healthCheck().catch(() => {
      this.logger.warn(`Executor[${dataSourceId}] 健康检查失败，清理重建`);
      this.evict(dataSourceId);
    });
    return existing; // 先返回，不阻塞调用方
  }
  const exec = this.createNew(dataSourceId, config);
  this.pool.set(dataSourceId, exec);
  return exec;
}
```

**4. 确保 evict 方法 dispose 连接**

确认 `ExecutorFactory.evict` 会调 `executor.dispose()`：

```typescript
evict(dataSourceId: string): void {
  const exec = this.pool.get(dataSourceId);
  if (exec) {
    exec.dispose().catch((err) => {
      this.logger.warn(`dispose executor[${dataSourceId}] failed: ${err}`);
    });
    this.pool.delete(dataSourceId);
  }
}
```

### 验证
```bash
grep -c "idleTimeoutMillis" apps/server/src/modules/datasource/executors/pg.executor.ts
# 应该 ≥ 1

grep -c "statement_timeout\|60000" apps/server/src/modules/datasource/executors/pg.executor.ts
# 应该 ≥ 1
```

---

## Task 12.3 · 【P0】修复 UploadCsvPage mock 文件列表

### Bug
`UploadCsvPage.tsx` 初始展示 `MOCK_FILES`（orders.csv / customers.csv / products.csv），用户看到假的文件列表。真实上传后虽然有 API 调用，但初始 mock 让用户困惑。

### 定位
`apps/web/src/features/datasources/UploadCsvPage.tsx`

### 改什么

**1. 删除 MOCK_FILES，初始为空列表**

```typescript
// 删除 MOCK_FILES 数组

// 初始 files 为空
const [files, setFiles] = useState<CsvFile[]>([]);
```

**2. 空列表时显示引导提示**

```tsx
{files.length === 0 ? (
  <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
    <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>还没有上传 CSV 文件</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
      点击上方区域或拖拽 CSV 文件到这里
    </div>
    <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
      选择文件
    </button>
  </div>
) : (
  // 已上传文件列表
  files.map(f => (
    <div key={f.id} className="csv-file-card">
      {/* ... */}
    </div>
  ))
)}
```

**3. 「开始探索」按钮在无文件时禁用**

```tsx
<button
  className="btn btn-primary btn-lg"
  onClick={handleStartExplore}
  disabled={submitting || files.filter(f => f.preview).length === 0}
>
  {submitting ? '创建中...' : `开始探索 ${files.filter(f => f.preview).length} 个 CSV`}
</button>
```

### 验证
```bash
grep -c "MOCK_FILES" apps/web/src/features/datasources/UploadCsvPage.tsx
# 应该 = 0
```

---

## Task 12.4 · 修复 explore SSE 错误反馈不清晰

### Bug
当 explore SSE 失败时（如 LLM 未配置、数据库连不上），前端可能只显示一个模糊的"探索出错"，用户不知道该怎么做。

### 定位
`apps/web/src/features/explore/hooks/useSSEExplore.ts`

### 改什么

**1. 确认 error 事件正确处理**

读取 `useSSEExplore.ts`，确认 SSE `error` 事件被正确解析并 `setError`。

**2. 错误信息友好化**

在 ExplorePage 的 error 展示中，根据错误内容给出具体建议：

```tsx
{error && (
  <div>
    <p style={{ marginBottom: 16, fontSize: 14, color: 'var(--error)' }}>
      探索失败: {error}
    </p>
    {error.includes('LLM_NOT_CONFIGURED') && (
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Agent 需要 LLM 来推断字段语义，请先配置 API Key
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/llm-config')}>
          去配置 LLM API Key
        </button>
      </div>
    )}
    {error.includes('Connection') || error.includes('ECONNREFUSED') || error.includes('timeout') ? (
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          数据库连接失败，请检查数据源配置
        </p>
        <button className="btn btn-secondary btn-lg" onClick={() => navigate('/datasources')}>
          检查数据源
        </button>
      </div>
    ) : null}
    <button className="btn btn-secondary btn-lg" onClick={() => {
      startedRef.current = false;
      if (datasourceId) startExplore(datasourceId);
    }}>
      重试
    </button>
  </div>
)}
```

### 验证
```bash
grep -c "LLM_NOT_CONFIGURED\|ECONNREFUSED\|timeout" apps/web/src/features/explore/ExplorePage.tsx
# 应该 ≥ 1
```

---

## Task 12.5 · 最终验证

### 创建 check-fix-12.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-12 验证 ==="

echo "[12.1] ExplorePage 接入真实 SSE..."
COUNT=$(grep -c "MOCK_PROGRESS\|setInterval" apps/web/src/features/explore/ExplorePage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "useSSEExplore" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL: 未用 useSSEExplore"; exit 1; }
echo "  ✓ ExplorePage 已接入真实 SSE"

echo "[12.2] PG executor 连接超时修复..."
grep -q "idleTimeoutMillis" apps/server/src/modules/datasource/executors/pg.executor.ts || { echo "✗ FAIL: 无 idleTimeoutMillis"; exit 1; }
echo "  ✓ PG executor 已优化"

echo "[12.3] UploadCsvPage mock 消除..."
COUNT=$(grep -c "MOCK_FILES" apps/web/src/features/datasources/UploadCsvPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 MOCK_FILES"; exit 1; fi
echo "  ✓ UploadCsvPage mock 已消除"

echo "[12.4] explore 错误反馈..."
grep -q "LLM_NOT_CONFIGURED\|ECONNREFUSED\|timeout" apps/web/src/features/explore/ExplorePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 错误反馈已优化"

echo ""
echo "====================================="
echo "✓ Fix-12 验证全部通过"
echo "====================================="
```

### 验证
```bash
bash docs/implementation/verification/check-fix-12.sh
```

---

## Fix-12 完成标准

✅ Task 12.1: ExplorePage 删除 MOCK_PROGRESS + setInterval，接入 useSSEExplore
✅ Task 12.2: pg.executor.ts 加 idleTimeoutMillis + statement_timeout
✅ Task 12.3: UploadCsvPage 删除 MOCK_FILES，初始为空
✅ Task 12.4: explore 错误反馈友好化（LLM 未配置 / 连接失败 分别给建议）

## 修复后的效果

### ExplorePage（真实 SSE）
```
进入 /explore/:dsId
  → useSSEExplore.startExplore(dsId)
  → GET /api/schema/explore?datasourceId=xxx (带 Authorization)
  → 真实 5 步 SSE 事件：
    step 1: connecting → done (已连接 · 18ms)
    progress: (无)
    step 2: discover_tables → active → done
    progress: table_discovered × N（逐表滚出真实表名+行数）
    step 3: analyze_fields → active → done
    progress: field_analyzed × N（逐字段滚出真实推断+置信度）
    step 4: infer_relations → done
    progress: relation_inferred × N
    step 5: generate_report → done
    done: { reviewNeeded, pendingFields, totalFields }
  
  → 如果 LLM 未配置：error 事件 → 显示「去配置 LLM」按钮
  → 如果连接失败：error 事件 → 显示「检查数据源」按钮
  → 成功：done 事件 → 显示「查看探索结果」或「进入工作台」按钮
```

### Chat 连接（不再超时）
```
用户提问 → PlannerAgent → query_details 工具 → PgExecutor.executeRaw
  → Pool 有 idleTimeoutMillis=30s（空闲连接回收）
  → statement_timeout=60s（单查询超时）
  → 连接断开时自动 evict + 重建
  → 不再报 "Connection terminated due to connection timeout"
```

### UploadCsvPage（真实上传）
```
进入 /datasources/csv
  → 初始空列表 + 引导提示「点击上传 CSV」
  → 用户选择文件 → uploadCsvPreview(file) → 返回预览
  → 文件卡片显示真实文件名 + 行数 + 列数
  → 点「开始探索」→ registerCsvFromPreview → 跳 /explore/:dsId
```

---
*AI生成*
