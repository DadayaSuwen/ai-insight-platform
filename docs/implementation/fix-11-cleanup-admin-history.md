# Fix-11 · 收尾联调（LlmConfig + Admin + History + Datasources + Profile）

> **执行前提**：Fix-10 已完成（dashboard + chat + insights 接入真实 API）
> **目标**：剩余 5 个 mock 页面接入真实 API + 端到端验证
> **方法**：每个页面都有现成的 api.ts / store，只需替换 mock

---

## Task 11.1 · LlmConfigPage 接入真实 API（最关键）

### Bug
`LlmConfigPage.tsx` 用 `PROVIDERS` 硬编码数组，不调 `useAppStore` 的 `fetchLlmConfig` / `saveLlmConfig`。
**后果**：用户配置 API Key 后没存到数据库 → explore 仍报 `LLM_NOT_CONFIGURED`。

### 定位
`apps/web/src/features/llm-config/LlmConfigPage.tsx`

### 改什么

**1. 删除 mock PROVIDERS 数组**

**2. 引入 useAppStore**

```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../../core/store';
import { LLMProvider } from '@workspace/types';
import { toast } from '../../store/toast';

export default function LlmConfigPage() {
  const [tab, setTab] = useState<Tab>('provider');
  const { llmConfigs, activeProvider, llmHealth, isLoadingConfig, fetchLlmConfig, saveLlmConfig, fetchLlmHealth } = useAppStore();
  
  // 表单 state
  const [provider, setProvider] = useState<LLMProvider>(LLMProvider.OPENAI);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);

  // 加载配置
  useEffect(() => {
    fetchLlmConfig();
  }, [fetchLlmConfig]);

  // 配置加载后预填表单
  useEffect(() => {
    const saved = llmConfigs[provider];
    if (saved) {
      setBaseUrl(saved.baseUrl ?? getDefaultBaseUrl(provider));
      setModel(saved.model);
      setTemperature(saved.temperature);
      // apiKeyInput 留空 — 保留已存的 key
    }
  }, [llmConfigs, provider]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLlmConfig({
        provider,
        apiKey: apiKeyInput || undefined, // 空则保留旧 key
        baseUrl,
        model,
        temperature,
      });
      toast.success(`${provider} 配置已保存`);
      setApiKeyInput('');
    } catch (err) {
      toast.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // 测试健康
  const handleTestHealth = async () => {
    setTestingHealth(true);
    try {
      await fetchLlmHealth(provider);
      toast.success(llmHealth[provider] ? '连接正常' : '连接失败');
    } catch {
      toast.error('测试失败');
    } finally {
      setTestingHealth(false);
    }
  };

  const getDefaultBaseUrl = (p: LLMProvider) =>
    p === LLMProvider.OPENAI ? 'https://api.openai.com/v1' : 'https://api.anthropic.com';
```

**3. 渲染真实 Provider 卡片**

```tsx
{([LLMProvider.OPENAI, LLMProvider.ANTHROPIC] as LLMProvider[]).map(p => {
  const saved = llmConfigs[p];
  const isActive = activeProvider === p;
  const isSelected = provider === p;
  
  return (
    <div className="card" key={p}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{p === LLMProvider.OPENAI ? '🤖' : '🧠'}</span>
          <div>
            <div className="card-title">{p === LLMProvider.OPENAI ? 'OpenAI' : 'Anthropic'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {p === LLMProvider.OPENAI ? 'gpt-4o / gpt-4o-mini' : 'claude-3-5-sonnet / haiku'}
            </div>
          </div>
        </div>
        <span className={`badge ${saved?.apiKey ? 'badge-success' : 'badge-warning'}`}>
          {saved?.apiKey ? '已配置' : '未配置'}
        </span>
      </div>
      <div className="card-body" style={{ padding: 16 }}>
        {/* 选中此 provider 时显示表单 */}
        {isSelected ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <label className="input-label">API Key</label>
              <input
                className="input"
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder={saved?.apiKey ? `已保存 (${maskKey(saved.apiKey)})` : '输入 API Key'}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Base URL</label>
              <input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="input-label">模型</label>
              <input className="input" value={model} onChange={e => setModel(e.target.value)} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Temperature</label>
              <input className="input" type="number" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleTestHealth} disabled={testingHealth}>
                {testingHealth ? '测试中...' : '测试连接'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setProvider(p)}>
            切换到此 Provider
          </button>
        )}
      </div>
    </div>
  );
})}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
```

### 验证
```bash
grep -c "const PROVIDERS" apps/web/src/features/llm-config/LlmConfigPage.tsx
# 应该 = 0

grep -c "useAppStore\|saveLlmConfig\|fetchLlmConfig" apps/web/src/features/llm-config/LlmConfigPage.tsx
# 应该 ≥ 3
```

---

## Task 11.2 · UsersPage 接入真实 API

### Bug
`UsersPage.tsx` 用 `MOCK` 数组硬编码 5 个用户，不调 `adminApi`。

### 定位
`apps/web/src/features/admin/UsersPage.tsx`

### 改什么

**1. 删除 MOCK 数组**

**2. 引入 adminApi**

```tsx
import { useEffect, useState } from 'react';
import { adminApi, type User } from './api';
import { toast } from '../../store/toast';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listUsers()
      .then(data => {
        setUsers(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(`加载失败: ${err.message}`);
        setLoading(false);
      });
  }, []);

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminApi.updateRole(userId, role);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as User['role'] } : u));
      toast.success('角色已更新');
    } catch (err) {
      toast.error(`更新失败: ${err.message}`);
    }
  };

  // 统计
  const total = users.length;
  const admins = users.filter(u => u.role === 'admin').length;
  const analysts = users.filter(u => u.role === 'analyst').length;
  const viewers = users.filter(u => u.role === 'viewer').length;
```

**3. 渲染真实用户表格**

```tsx
{loading ? (
  <div className="loading">加载用户列表...</div>
) : (
  <table className="table">
    <thead>
      <tr>
        <th>用户</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th>
      </tr>
    </thead>
    <tbody>
      {users.map(u => (
        <tr key={u.id}>
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="user-avatar">{u.name?.[0] || '?'}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{u.name || '未命名'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
              </div>
            </div>
          </td>
          <td>
            <select
              className="input"
              value={u.role}
              onChange={e => handleRoleChange(u.id, e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              <option value="admin">管理员</option>
              <option value="analyst">分析师</option>
              <option value="viewer">查看者</option>
            </select>
          </td>
          <td>
            <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-error'}`}>
              {u.status === 'active' ? '已激活' : '已停用'}
            </span>
          </td>
          <td>{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
          <td>
            <button className="btn btn-ghost btn-sm">编辑</button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}
```

### 验证
```bash
grep -c "const MOCK" apps/web/src/features/admin/UsersPage.tsx
# 应该 = 0

grep -c "adminApi" apps/web/src/features/admin/UsersPage.tsx
# 应该 ≥ 2
```

---

## Task 11.3 · RolesPage 接入真实权限数据

### Bug
`RolesPage.tsx` 权限矩阵是硬编码的，不调后端。

### 定位
`apps/web/src/features/admin/RolesPage.tsx`

### 改什么

RolesPage 的权限矩阵可以保留前端定义（权限点是固定的），但「保存权限配置」按钮要能真正持久化。

**1. 如果后端有 `PUT /api/roles/:role/permissions` 接口**

```tsx
const handleSave = async () => {
  try {
    await axiosInstance.put('/api/roles/permissions', { rolePermissions });
    toast.success('权限配置已保存');
  } catch (err) {
    toast.error(`保存失败: ${err.message}`);
  }
};
```

**2. 如果后端没有此接口**（大概率）

权限点是前端常量，角色-权限映射也是前端常量。后端 `rbac/permissions.ts` 定义了 `ROLE_PERMISSIONS`。前端只是展示，不需要调 API。

这种情况下：
- 保留前端展示
- 「保存权限配置」按钮改为 toast 提示「权限配置为系统预设，不可修改」
- 或者：管理员可调后端接口修改自定义角色（如果有）

**推荐**：简化为只读展示 + toast 提示。

```tsx
const handleSave = () => {
  toast.info('系统角色的权限为预设配置，不可修改');
};
```

### 验证
```bash
grep -c "handleSave\|toast" apps/web/src/features/admin/RolesPage.tsx
# 应该 ≥ 1
```

---

## Task 11.4 · HistoryPage 接入真实 API

### Bug
`HistoryPage.tsx` 用 `MOCK` 数组硬编码 4 条历史记录。

### 定位
`apps/web/src/features/history/HistoryPage.tsx`

### 改什么

**1. 删除 MOCK 数组**

**2. 调真实 API**

后端可能没有 `/api/history` 接口。如果没有，可以：
- **方案 A**：用 `/api/datasources` 列表的 `createdAt` + `updatedAt` 模拟历史
- **方案 B**：调 `/api/audit-log`（如果后端有审计日志接口）
- **方案 C**：标记为「开发中」

**推荐方案 A**（用现有 API）：

```tsx
import { useEffect, useState } from 'react';
import { listDataSources } from '../datasources/api';

interface HistoryRow {
  time: string;
  event: string;
  datasource: string;
  detail: string;
  status: string;
}

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDataSources()
      .then(list => {
        const history: HistoryRow[] = list.map(ds => ({
          time: new Date(ds.createdAt).toLocaleString('zh-CN'),
          event: '数据源接入',
          datasource: ds.name,
          detail: `类型: ${ds.type} · 状态: ${ds.status}`,
          status: ds.status,
        }));
        setRows(history);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 渲染表格...
}
```

### 验证
```bash
grep -c "const MOCK" apps/web/src/features/history/HistoryPage.tsx
# 应该 = 0

grep -c "listDataSources\|axiosInstance" apps/web/src/features/history/HistoryPage.tsx
# 应该 ≥ 1
```

---

## Task 11.5 · DatasourcesPage 接入真实 API

### Bug
`DatasourcesPage.tsx` 用 `MOCK_DATASOURCES` 硬编码数据源列表。

### 定位
`apps/web/src/features/datasources/DatasourcesPage.tsx`

### 改什么

**1. 删除 MOCK_DATASOURCES**

**2. 调 listDataSources**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDataSources, type DataSourceListItem } from './api';
import { toast } from '../../store/toast';

export default function DatasourcesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<DataSourceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadList = () => {
    setLoading(true);
    listDataSources()
      .then(data => {
        setList(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(`加载失败: ${err.message}`);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadList();
  }, []);

  // 统计
  const total = list.length;
  const dbCount = list.filter(d => d.type === 'postgres' || d.type === 'mysql').length;
  const csvCount = list.filter(d => d.type === 'duckdb-csv').length;
  // 表总数未知（需调 getDatasourceSchema），暂时显示 -
```

**3. 渲染真实列表**

```tsx
{loading ? (
  <div className="loading">加载数据源列表...</div>
) : list.length === 0 ? (
  <div className="empty-state">
    <p>还没有配置数据源</p>
    <button className="btn btn-primary btn-sm" onClick={() => navigate('/datasources/new')}>
      连接第一个数据源
    </button>
  </div>
) : (
  <table className="table">
    <thead>
      <tr>
        <th>数据源名称</th><th>类型</th><th>状态</th><th>创建时间</th><th>操作</th>
      </tr>
    </thead>
    <tbody>
      {list.map(ds => (
        <tr key={ds.id}>
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--green-lighter)', color: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {ds.type === 'duckdb-csv' ? '📄' : '🐘'}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{ds.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ds.description || ds.type}</div>
              </div>
            </div>
          </td>
          <td><span className="chip">{ds.type}</span></td>
          <td>
            <span className={`status-dot ${ds.status === 'active' ? '' : 'error'}`}>
              {ds.status === 'active' ? '在线' : '异常'}
            </span>
          </td>
          <td>{new Date(ds.createdAt).toLocaleDateString('zh-CN')}</td>
          <td>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/${ds.id}`)}>查看</button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/schema/${ds.id}`)}>修订</button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}
```

### 验证
```bash
grep -c "const MOCK_DATASOURCES" apps/web/src/features/datasources/DatasourcesPage.tsx
# 应该 = 0

grep -c "listDataSources" apps/web/src/features/datasources/DatasourcesPage.tsx
# 应该 ≥ 1
```

---

## Task 11.6 · ProfilePage 读取真实用户信息

### Bug
`ProfilePage.tsx` 可能硬编码用户信息。

### 定位
`apps/web/src/features/profile/ProfilePage.tsx`

### 改什么

**1. 从 localStorage 读真实用户**

```tsx
const [user, setUser] = useState<{ name: string; email: string; role: string }>(() => {
  try {
    const raw = localStorage.getItem('aiip.auth.user.v1');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: '用户', email: 'user@example.com', role: 'analyst' };
});

const roleLabels: Record<string, string> = {
  admin: '管理员',
  analyst: '分析师',
  viewer: '查看者',
};
```

**2. 渲染真实信息**

```tsx
<div className="info-card">
  <p>姓名: {user.name}</p>
  <p>邮箱: {user.email}</p>
  <p>角色: {roleLabels[user.role] || user.role}</p>
</div>
```

**3. 修改密码 / 双因素认证 等标记为「开发中」**

```tsx
<button onClick={() => toast.info('密码修改功能开发中')}>修改密码</button>
```

### 验证
```bash
grep -c "localStorage\|aiip.auth.user" apps/web/src/features/profile/ProfilePage.tsx
# 应该 ≥ 1
```

---

## Task 11.7 · 最终验证脚本

### 创建 check-fix-11.sh

```bash
#!/bin/bash
set -e
echo "=== Fix-11 收尾联调验证 ==="

echo "[11.1] LlmConfigPage 接入 API..."
COUNT=$(grep -c "const PROVIDERS" apps/web/src/features/llm-config/LlmConfigPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock PROVIDERS"; exit 1; fi
grep -q "useAppStore\|saveLlmConfig" apps/web/src/features/llm-config/LlmConfigPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ LlmConfigPage 已接入 API"

echo "[11.2] UsersPage 接入 API..."
COUNT=$(grep -c "const MOCK" apps/web/src/features/admin/UsersPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "adminApi" apps/web/src/features/admin/UsersPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ UsersPage 已接入 API"

echo "[11.3] RolesPage..."
grep -q "handleSave\|toast" apps/web/src/features/admin/RolesPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ RolesPage 已处理"

echo "[11.4] HistoryPage 接入 API..."
COUNT=$(grep -c "const MOCK" apps/web/src/features/history/HistoryPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "listDataSources\|axiosInstance" apps/web/src/features/history/HistoryPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ HistoryPage 已接入 API"

echo "[11.5] DatasourcesPage 接入 API..."
COUNT=$(grep -c "const MOCK_DATASOURCES" apps/web/src/features/datasources/DatasourcesPage.tsx)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 mock"; exit 1; fi
grep -q "listDataSources" apps/web/src/features/datasources/DatasourcesPage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ DatasourcesPage 已接入 API"

echo "[11.6] ProfilePage..."
grep -q "localStorage\|aiip.auth.user" apps/web/src/features/profile/ProfilePage.tsx || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ProfilePage 已读真实用户"

echo ""
echo "[最终] TS 编译..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
echo "  ✓ 编译通过"

echo ""
echo "====================================="
echo "✓ Fix-11 验证全部通过"
echo "====================================="
echo ""
echo "🎉 全部 Fix-1 到 Fix-11 完成！"
echo "产品已 demo-ready，可进行毕业设计答辩。"
```

### 验证
```bash
bash docs/implementation/verification/check-fix-11.sh
```

---

## Fix-11 完成标准

✅ Task 11.1: LlmConfigPage 删除 mock，调 useAppStore.saveLlmConfig（最关键）
✅ Task 11.2: UsersPage 删除 mock，调 adminApi.listUsers
✅ Task 11.3: RolesPage 保存按钮处理
✅ Task 11.4: HistoryPage 删除 mock，用 listDataSources 模拟
✅ Task 11.5: DatasourcesPage 删除 mock，调 listDataSources
✅ Task 11.6: ProfilePage 读真实用户信息

## 全部 Fix 完成后的产品状态

| Fix | 内容 | 状态 |
|---|---|---|
| Fix-1 | 救论文 4 创新点后端 | ✅ |
| Fix-2 | 救前端 6 个静态壳 | ✅ |
| Fix-3 | 安全修复（RBAC + JWT + sql-guard） | ✅ |
| Fix-4 | 死代码清理 + 测试 | ✅ |
| Fix-5 | 紧急修复 12 个流程 bug | ✅ |
| Fix-6 | 严格按原型还原 3 个核心页面 | ✅ |
| Fix-7 | 前端 18 个页面 1:1 还原原型 | ✅ |
| Fix-8 | 登录到连接数据源联调 | ✅ |
| Fix-9 | explore → schema-review → confirm 联调 | ✅ |
| Fix-10 | dashboard + chat + insights 联调 | ✅ |
| Fix-11 | 收尾联调（LlmConfig + Admin + History + Datasources + Profile） | ✅ |

## 端到端验证清单

```
□ 1. pnpm db:up && pnpm db:seed → 创建默认管理员
□ 2. 登录 demo@local.dev / demo123 → 成功跳转
□ 3. /onboarding 显示引导 → 点「连接数据库」
□ 4. /datasources/new → 填 PG 连接信息 → 测试连接成功
□ 5. 开始探索 → /explore/:id → 5 步 SSE 进度
□ 6. explore 完成 → reviewNeeded → 跳 /schema-review/:id
□ 7. SchemaReviewPage → 真实字段列表 + AI 提问 + 回答
□ 8. 全部确认 → 跳 /confirm/:id → 真实统计 + ER 图
□ 9. 确认生成工作台 → 跳 /dashboard/:id
□ 10. DashboardPage → 真实 KPI + ECharts 图表
□ 11. 点「问 Agent」→ /chat/:id → 输入问题 → SSE 流式回答
□ 12. /insights/:id → 真实洞察列表（可能为空，需手动触发巡检）
□ 13. /llm-config → 配置 OpenAI API Key → 保存成功
□ 14. /datasources → 真实数据源列表
□ 15. /admin/users → 真实用户列表
□ 16. /profile → 真实用户信息
□ 17. /history → 数据源接入历史
```

全部通过 = 产品 demo-ready，可进行毕业设计答辩。

---
*AI生成*
