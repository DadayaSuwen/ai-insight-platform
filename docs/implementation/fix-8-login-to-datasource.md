# Fix-8 · 从登录到连接数据源端到端联调

> **执行前提**：前端 UI 已还原（Fix-7 完成）
> **目标**：让「登录 → 注册 → 引导 → 连接数据库 → 开始探索」全链路真实跑通
> **方法**：每个 Task 定位真实 bug → 修 → 验证

---

## Task 8.1 · 修复首次启动无用户可登录的问题

### Bug
`prisma/seed.ts` 不创建任何用户。`onApplicationBootstrap` 只在检测到 `DEFAULT_USER_ID` 存在且为占位符时才升级为 demo 用户，但 seed 不创建这个占位用户。

**后果**：首次 `pnpm db:seed` 后数据库为空，登录页输入任何账号都报 "Invalid email or password"。

### 定位
`apps/server/prisma/seed.ts`

### 改什么

**1. 修改 seed.ts，创建默认管理员**

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

async function main() {
  console.log('✅ Seed: 创建默认管理员...');

  const existing = await prisma.user.findUnique({
    where: { id: DEFAULT_USER_ID },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash('demo123', 10);
    await prisma.user.create({
      data: {
        id: DEFAULT_USER_ID,
        email: 'demo@local.dev',
        passwordHash,
        name: 'Demo Admin',
        role: 'ADMIN',
        status: 'active',
      },
    });
    console.log('✅ 默认管理员已创建: demo@local.dev / demo123');
  } else {
    console.log('✅ 默认管理员已存在，跳过');
  }
}

main()
  .catch((e) => {
    console.error('Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**2. 修改 LoginPage 默认值**

**文件**：`apps/web/src/features/auth/LoginPage.tsx`

找到默认 email/password（约 line 12-13）：
```typescript
// 修改前
const [email, setEmail] = useState('li.weiming@example.com');
const [password, setPassword] = useState('demo-password');

// 修改后
const [email, setEmail] = useState('demo@local.dev');
const [password, setPassword] = useState('demo123');
```

### 验证
```bash
grep -q "demo@local.dev" apps/server/prisma/seed.ts && echo "✓" || echo "✗"
grep -q "demo@local.dev" apps/web/src/features/auth/LoginPage.tsx && echo "✓" || echo "✗"
```

### 用户验证步骤（本地执行）
```bash
# 1. 重置数据库
pnpm db:up
pnpm db:seed

# 2. 启动后端
pnpm dev:server

# 3. 启动前端
pnpm dev:web

# 4. 浏览器打开 http://localhost:5173
# 5. 登录页应该预填 demo@local.dev / demo123
# 6. 点登录 → 应该成功跳转到首页
```

---

## Task 8.2 · 修复登录后跳转到空白页

### Bug
登录成功后 `navigate('/')`，但 `/` 路由渲染 `HomeRedirect`：
- 如果 `useDatasourceStore.currentDatasourceId` 为 null → 跳 `/onboarding`
- 如果有 → 跳 `/dashboard/:id`

但登录后 store 是空的（新登录用户没数据源），应该跳 onboarding。

### 定位
`apps/web/src/App.tsx` 的 `HomeRedirect` + `apps/web/src/features/onboarding/OnboardingPage.tsx`

### 改什么

**1. 确认 HomeRedirect 逻辑**

读取 `App.tsx` 中的 `HomeRedirect`：
```tsx
function HomeRedirect() {
  const dsId = useDatasourceStore((s) => s.currentDatasourceId);
  if (dsId) return <Navigate to={`/dashboard/${dsId}`} replace />;
  return <Navigate to="/onboarding" replace />;
}
```
这个逻辑是对的。

**2. 修复 OnboardingPage 检测逻辑**

**文件**：`apps/web/src/features/onboarding/OnboardingPage.tsx`

读取现有 useEffect，确认它调 `/api/datasources` 检测。如果有数据源就跳 dashboard，否则显示引导。

**关键检查**：OnboardingPage 的 axios 调用是否带了 token？

```tsx
// 应该用 axiosInstance（自动注入 token），不要用 fetch
useEffect(() => {
  axiosInstance.get('/api/datasources')
    .then(res => {
      const list = res.data.data ?? [];
      if (list.length > 0) {
        const finalized = list.find(d => d.exploreStatus === 'finalized');
        const target = finalized || list[0];
        useDatasourceStore.getState().setCurrent(target.id, target.name);
        if (target.exploreStatus === 'finalized') {
          navigate(`/dashboard/${target.id}`, { replace: true });
        } else {
          navigate(`/explore/${target.id}`, { replace: true });
        }
      } else {
        setChecking(false);
      }
    })
    .catch(() => setChecking(false));
}, [navigate]);
```

如果现有代码用的是 `fetch` 而非 `axiosInstance`，改为 `axiosInstance`。

### 验证
```bash
grep -q "axiosInstance" apps/web/src/features/onboarding/OnboardingPage.tsx && echo "✓" || echo "✗"
```

### 用户验证步骤
```
登录成功 → 应该跳到 /onboarding → 显示引导卡片（连接数据库 / 上传 CSV）
```

---

## Task 8.3 · 修复 ConnectDatabasePage 不调后端 API

### Bug（严重）
ConnectDatabasePage 的「开始探索」按钮直接 `navigate('/explore/:dsId')`，**根本没调后端 `POST /api/datasources` 创建数据源**。

**后果**：跳到 explore 页后，explore SSE 调后端 `/api/schema/explore?datasourceId=xxx`，但这个 dsId 是前端编的（`form.database`），后端找不到 → 报错。

### 定位
`apps/web/src/features/datasources/ConnectDatabasePage.tsx`

### 改什么

**1. 「测试连接」按钮调真实 API**

```tsx
import { testDatabaseConnection, registerDatabaseConnection } from './api';

const handleTest = async () => {
  setTesting(true);
  try {
    const result = await testDatabaseConnection({
      type: dbType as 'postgres' | 'mysql',
      host: form.host,
      port: parseInt(form.port),
      database: form.database,
      user: form.user,
      password: form.password,
      schema: form.schema,
    });
    if (result.ok) {
      toast.success(`连接成功 · 延迟 ${result.latencyMs}ms`);
    } else {
      toast.error(`连接失败: ${result.error || '未知错误'}`);
    }
  } catch (err) {
    toast.error(`测试失败: ${(err as Error).message}`);
  } finally {
    setTesting(false);
  }
};
```

**2. 「开始探索」按钮调 register API 创建数据源**

```tsx
const [submitting, setSubmitting] = useState(false);

const handleStartExplore = async () => {
  setSubmitting(true);
  try {
    // 1. 调后端注册数据源
    const ds = await registerDatabaseConnection({
      id: crypto.randomUUID(),  // 前端生成 UUID
      name: form.name,
      description: `${dbType} ${form.host}:${form.port}/${form.database}`,
      config: {
        type: dbType as 'postgres' | 'mysql',
        host: form.host,
        port: parseInt(form.port),
        database: form.database,
        user: form.user,
        password: form.password,
        schema: form.schema,
      },
    });
    
    // 2. 更新全局 store
    useDatasourceStore.getState().setCurrent(ds.id, ds.name);
    
    // 3. 跳转到探索页
    toast.success(`数据源「${ds.name}」已创建，开始探索...`);
    navigate(`/explore/${ds.id}`);
  } catch (err) {
    toast.error(`创建数据源失败: ${(err as Error).message}`);
  } finally {
    setSubmitting(false);
  }
};
```

**3. 修改按钮 onClick**

```tsx
{/* 测试连接 */}
<button onClick={handleTest} disabled={testing}>
  {testing ? '测试中...' : '测试连接'}
</button>

{/* 开始探索 */}
<button onClick={handleStartExplore} disabled={submitting}>
  {submitting ? '创建中...' : '开始探索'}
</button>
```

### 验证
```bash
grep -q "registerDatabaseConnection" apps/web/src/features/datasources/ConnectDatabasePage.tsx && echo "✓" || echo "✗"
grep -q "testDatabaseConnection" apps/web/src/features/datasources/ConnectDatabasePage.tsx && echo "✓" || echo "✗"
```

### 用户验证步骤
```
1. 引导页点「连接数据库」→ 进 ConnectDatabasePage
2. 填写真实 PG 连接信息（或本地测试库）
3. 点「测试连接」→ 应显示「连接成功 · 延迟 XXms」
4. 点「开始探索」→ 应创建数据源 + 跳到 /explore/:realId
```

---

## Task 8.4 · 修复 ExplorePage 接收真实 datasourceId

### Bug
ExplorePage 从 URL 拿 `datasourceId`，调 `startExplore(datasourceId)`。需要确认 `useSSEExplore` hook 的 SSE URL 正确。

### 定位
`apps/web/src/features/explore/hooks/useSSEExplore.ts`

### 改什么

**1. 确认 SSE URL 正确**

```typescript
const url = `${API_BASE}/api/schema/explore?datasourceId=${encodeURIComponent(datasourceId)}`;
```

**2. 确认 SSE 请求带 token**

SSE 用 `fetch` + `EventSource` 或 `ReadableStream`。如果是 `fetch`，需手动加 Authorization header：

```typescript
const res = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
    'Accept': 'text/event-stream',
  },
});
```

如果用 `EventSource`，它不支持自定义 header，需要改用 `fetch` + `ReadableStream` 解析 SSE。

**3. 确认后端 explore controller 接收 datasourceId**

读取 `apps/server/src/modules/schema-explorer/explore.controller.ts`：
```typescript
@Sse('explore')
async explore(@Query('datasourceId') datasourceId: string, @Req() req: any) {
  // ...
}
```

### 验证
```bash
grep -q "Authorization" apps/web/src/features/explore/hooks/useSSEExplore.ts && echo "✓" || echo "✗（SSE 未带 token）"
```

### 用户验证步骤
```
1. ConnectDatabasePage 创建数据源后跳 /explore/:realId
2. ExplorePage 应该自动开始 SSE 探索
3. 应该看到 5 步进度 + 日志
```

---

## Task 8.5 · 修复 UploadCsvPage 不调后端 API

### Bug
同 Task 8.3，UploadCsvPage 的「开始探索 3 个 CSV」按钮可能也是直接 navigate，没调后端 upload/register API。

### 定位
`apps/web/src/features/datasources/UploadCsvPage.tsx`

### 改什么

**1. 确认上传逻辑调真实 API**

读取 UploadCsvPage，确认：
- 文件选择后调 `uploadCsvPreview(file)` 获取 uploadId + 预览
- 「开始探索」按钮调 `registerCsvFromPreview({ uploadId, name, columnOverrides })`
- 注册成功后跳 `/explore/:dsId`

**2. 如果是 mock，改为真实调用**

```tsx
import { uploadCsvPreview, registerCsvFromPreview } from './api';

const handleFileSelect = async (file: File) => {
  try {
    const preview = await uploadCsvPreview({ file });
    setPreviews(prev => [...prev, preview]);
  } catch (err) {
    toast.error(`上传失败: ${(err as Error).message}`);
  }
};

const handleStartExplore = async () => {
  if (previews.length === 0) return;
  setSubmitting(true);
  try {
    const first = previews[0];
    const ds = await registerCsvFromPreview({
      uploadId: first.uploadId,
      name: first.originalName.replace('.csv', ''),
      columnOverrides: first.columns.map(c => ({
        originalName: c.originalName,
        newName: c.defaultName,
        type: 'AUTO' as const,
      })),
    });
    useDatasourceStore.getState().setCurrent(ds.id, ds.name);
    toast.success(`CSV 数据源已创建`);
    navigate(`/explore/${ds.id}`);
  } catch (err) {
    toast.error(`注册失败: ${(err as Error).message}`);
  } finally {
    setSubmitting(false);
  }
};
```

### 验证
```bash
grep -q "uploadCsvPreview\|registerCsvFromPreview" apps/web/src/features/datasources/UploadCsvPage.tsx && echo "✓" || echo "✗"
```

---

## Task 8.6 · 修复后端 datasource register 接受前端传的 id

### Bug
前端 `registerDatabaseConnection` 传了 `id: crypto.randomUUID()`，但后端可能不接受前端传 id（后端自己生成）。

### 定位
`apps/server/src/modules/datasource/datasource.controller.ts` 的 `@Post()` register 方法

### 改什么

**1. 读取后端 register 逻辑**

```bash
grep -A30 "@Post()" apps/server/src/modules/datasource/datasource.controller.ts | head -35
```

确认：
- 后端是否接受 body 中的 `id` 字段？
- 如果不接受，前端不传 id，后端生成后返回

**2. 如果后端不接受 id，修改前端**

```typescript
// 前端不传 id，后端生成
const ds = await registerDatabaseConnection({
  // id 不传
  name: form.name,
  description: `${dbType} ${form.host}:${form.port}/${form.database}`,
  config: { ... },
});
```

**3. 确认后端返回的 data 含 id**

后端 register 返回 `{ success: true, data: DataSourceListItem }`，DataSourceListItem 含 id 字段。

### 验证
```bash
# 后端 register 是否接受 id
grep -A20 "async register" apps/server/src/modules/datasource/datasource.controller.ts | grep -E "id|body"
```

---

## Task 8.7 · 修复 explore SSE 探索失败

### Bug
即使数据源创建成功，explore SSE 可能因为以下原因失败：
1. datasource 的 connectionConfig 加密/解密问题
2. metadata.introspect 超时
3. LLM 未配置导致语义推断失败

### 定位
`apps/server/src/modules/schema-explorer/explore.service.ts`

### 改什么

**1. 确认 explore 第 1 步连接测试**

读取 explore.service.ts 的第 1 步，确认它用 `datasourceService.getByIdForUser` + `decryptConfigForExecutor` + `executor.healthCheck()`。

**2. 确认 LLM 配置存在**

explore 第 3 步调 LLM 做语义推断。如果 LLM 未配置，会失败。

**3. 在 explore 第 3 步加 LLM 配置检查**

```typescript
// 第 3 步前加检查
const llmConfig = await this.db.db
  .selectFrom('LLMConfig')
  .selectAll()
  .orderBy('updatedAt', 'desc')
  .executeTakeFirst();

if (!llmConfig || !llmConfig.apiKey) {
  yield this.sseEvent('error', {
    code: 'LLM_NOT_CONFIGURED',
    message: '请先在「模型配置」页面配置 LLM API Key',
  });
  return;
}
```

**4. 前端 explore 错误处理**

ExplorePage 收到 error 事件后，如果是 `LLM_NOT_CONFIGURED`，显示「去配置 LLM」按钮跳 `/llm-config`。

### 验证
```bash
grep -q "LLM_NOT_CONFIGURED\|llmConfig" apps/server/src/modules/schema-explorer/explore.service.ts && echo "✓" || echo "✗"
```

---

## Task 8.8 · 最终验证脚本

### 创建 check-fix-8.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-8 联调验证 ==="

echo "[8.1] 默认用户..."
grep -q "demo@local.dev" apps/server/prisma/seed.ts || { echo "✗ FAIL"; exit 1; }
grep -q "demo@local.dev" apps/web/src/features/auth/LoginPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 默认用户已配置"

echo "[8.2] Onboarding 检测..."
grep -q "axiosInstance" apps/web/src/features/onboarding/OnboardingPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Onboarding 用 axiosInstance"

echo "[8.3] ConnectDatabase 调 API..."
grep -q "registerDatabaseConnection" apps/web/src/features/datasources/ConnectDatabasePage.tsx || { echo "✗ FAIL"; exit 1; }
grep -q "testDatabaseConnection" apps/web/src/features/datasources/ConnectDatabasePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ConnectDatabase 调真实 API"

echo "[8.4] Explore SSE 带 token..."
grep -q "Authorization" apps/web/src/features/explore/hooks/useSSEExplore.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Explore SSE 带 token"

echo "[8.5] UploadCsv 调 API..."
grep -q "uploadCsvPreview\|registerCsvFromPreview" apps/web/src/features/datasources/UploadCsvPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ UploadCsv 调真实 API"

echo "[8.7] Explore LLM 检查..."
grep -q "LLM_NOT_CONFIGURED\|llmConfig" apps/server/src/modules/schema-explorer/explore.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ Explore LLM 检查已加"

echo ""
echo "[最终] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-8 验证全部通过"
echo "====================================="
echo ""
echo "下一步：本地启动项目验证完整流程"
echo "  1. pnpm db:up && pnpm db:seed"
echo "  2. pnpm dev:server"
echo "  3. pnpm dev:web"
echo "  4. 浏览器打开 http://localhost:5173"
echo "  5. 用 demo@local.dev / demo123 登录"
echo "  6. 点「连接数据库」→ 填写 PG 连接信息 → 测试连接 → 开始探索"
echo "  7. 观察 explore 页 5 步进度"
echo "  8. 如果报 LLM_NOT_CONFIGURED → 去模型配置页配置 API Key"
```

### 验证
```bash
bash docs/implementation/verification/check-fix-8.sh
```

---

## Fix-8 完成标准

✅ Task 8.1: seed.ts 创建默认管理员 demo@local.dev / demo123
✅ Task 8.2: OnboardingPage 用 axiosInstance 调 /api/datasources
✅ Task 8.3: ConnectDatabasePage 调 testDatabaseConnection + registerDatabaseConnection
✅ Task 8.4: ExplorePage SSE 请求带 Authorization header
✅ Task 8.5: UploadCsvPage 调 uploadCsvPreview + registerCsvFromPreview
✅ Task 8.6: 后端 register 接受/生成 id 一致
✅ Task 8.7: Explore 第 3 步检查 LLM 配置
✅ Task 8.8: 验证脚本通过

## 修复后的完整流程

```
1. pnpm db:up && pnpm db:seed
   → 创建默认管理员 demo@local.dev / demo123

2. 浏览器打开 http://localhost:5173
   → 登录页预填 demo@local.dev / demo123

3. 点登录
   → POST /auth/login 成功
   → 存 token 到 localStorage
   → 跳 / → HomeRedirect → 跳 /onboarding

4. OnboardingPage 检测 /api/datasources
   → 空数组 → 显示引导卡片

5. 点「连接数据库」
   → 跳 /datasources/new → ConnectDatabasePage

6. 填写 PG 连接信息 → 点「测试连接」
   → POST /api/datasources/test → 返回 { ok: true, latencyMs: 18 }

7. 点「开始探索」
   → POST /api/datasources → 创建数据源 → 返回 { id: "ds_xxx" }
   → setCurrent(ds_xxx, name)
   → 跳 /explore/ds_xxx

8. ExplorePage 启动 SSE
   → GET /api/schema/explore?datasourceId=ds_xxx (带 Authorization)
   → 5 步探索进度
   → 如果 LLM 未配置 → error 事件 → 显示「去配置 LLM」按钮
   → 如果 LLM 已配置 → 探索完成 → reviewNeeded → 跳 /schema-review/ds_xxx
```

## ⚠️ 重要提醒

**执行顺序**：
1. 先执行 Fix-8 所有 Task
2. 然后本地启动项目
3. 按上面的流程逐步验证
4. 如果某步报错，记录错误信息，反馈给我

**如果 LLM 未配置**：
- explore 第 3 步会失败
- 需要先去 `/llm-config` 配置 OpenAI / Anthropic API Key
- 配置后重新探索

---
*AI生成*
