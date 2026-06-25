# 2026-06-25 Agent 工具结果持久化修复

## 症状

用户在 AI Insight Platform 中向 agent 发送消息，agent 调 `query_sales` / `gen_chart`
工具生成的**图表 + DataTable 表格**在流式生成期间可见，但**刷新页面 / 切会话再回来后
消失**，只剩 LLM 写的那段 Markdown 文本回复。

## 根因（数据契约双向错乱）

1. **DB 列类型**：`prisma/schema.prisma:66` `ChatMessage.metadata` 是 `Json?` →
   Postgres **JSONB** 列。
2. **写库**（`chat-session.service.ts:52`，修复前）：
   `metadata: JSON.stringify({ toolCalls, toolResults })` —— **应用层手写 stringify**。
   pg 驱动对 JSONB 接受 string 输入，存进 JSONB 实际是合法 JSON 字符串（不报错）。
3. **读库**：Kysely `selectAll()` + pg 驱动对 JSONB 列**自动 `JSON.parse` 成对象**返回。
4. **前端**（`recordToChatMessage.ts:24`，修复前）：
   `JSON.parse(r.metadata)` —— **对象上再 parse 一次抛 `SyntaxError: Unexpected token o`，
   catch 块静默吞掉** → `meta = {}` → `toolResults = []` →
   `MessageBubble` 第 129 行条件不满足 → 图表/表格不渲染。
5. **Kysely 类型谎言**：`core/kysely/types.ts:15` 声明 `metadata: string | null`，
   但实际是 JSONB 类型——**这是写入端 stringify 错误的根源**（类型告诉你"传 string"，
   你就 stringify）。

**本质**：写入端 stringify + 读出端被驱动自动 parse + 前端再 parse，**三次形态转换**
而不是一次。

## 修复

### Commit 1: 写入端契约统一（后端）

| 文件 | 改动 |
|---|---|
| `apps/server/src/core/kysely/types.ts:11-22` | `metadata` 类型 `string \| null` → `Record<string, unknown> \| null`（反映 JSONB 真相 + 防止以后又有人 stringify） |
| `apps/server/src/modules/chat/chat-session.service.ts:39-58` | `saveMessage` 删 `JSON.stringify`，直接传对象 |

**关键原则**：pg 驱动对 JSONB 接受 JS 对象并自动序列化，**应用层禁止再 `JSON.stringify`**。

### Commit 2: 读取端兼容 string + object（前端）

| 文件 | 改动 |
|---|---|
| `apps/web/src/types/chat.ts:11-25` | `metadata` 联合类型 `string \| Record<string, unknown> \| null` |
| `apps/web/src/features/chat/utils/recordToChatMessage.ts:24-48` | 三段式安全解析：string → parse，object → 直接用，其他 → `{}`；catch 块升级到 `console.warn` |

**保留 string 兜底分支**是为兼容**已存在的历史脏数据**——这些行的 `metadata` 顶层是
字符串而非对象，pg 驱动不会自动 unwrap。

## 验证步骤

1. `pnpm --filter @ai-insight/server exec tsc --noEmit` → 0 错误
2. `pnpm --filter @ai-insight/web exec tsc --noEmit` → 0 错误
3. 浏览器发一条 "按地区统计销售额" → 流式期间看到 Markdown + DataTable + 图表
4. **F5 刷新** → 图表和 DataTable 仍在
5. DevTools Network 看 `GET /chat/sessions/:id/messages` 响应：
   `metadata` 是 `{"toolCalls":...,"toolResults":...}`（对象，不再是字符串）
6. 切会话再切回来 → 工具结果仍在

## 诊断 SQL：检查历史脏数据

> ⚠️ **先跑诊断再决定是否清理**。本节 SQL 是只读查询，安全。

### 1. 找出"双重 stringify"脏数据

健康数据：JSONB 顶层是 `object`（`{"toolCalls":...}`）
脏数据：JSONB 顶层是 `string`（`"{\"toolCalls\":...}"`），因为旧代码手写
`JSON.stringify` 后写入 JSONB。

```sql
-- 看 20 条最近的"双重 stringify"脏数据
SELECT
  id,
  "sessionId",
  role,
  "createdAt",
  metadata,
  length(metadata::text) AS len,
  substring(metadata::text, 1, 30) AS preview
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata IS NOT NULL
  AND jsonb_typeof(metadata) = 'string'   -- 顶层是字符串 = 被双重 stringify
ORDER BY "createdAt" DESC
LIMIT 20;
```

返回行数 = 脏数据条数。如果返回 0 行，说明历史没有脏数据（用户是新部署的）。

### 2. 统计 metadata 完全缺失

```sql
SELECT COUNT(*) AS null_metadata_count
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata IS NULL;
```

### 3. 找 metadata 不是合法 JSON 的（更严重的 write 端 bug）

```sql
SELECT
  id,
  metadata::text AS raw
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata IS NOT NULL
  AND metadata::text !~ '^\s*[\{\[]'  -- 不以 { 或 [ 开头 = 坏数据
LIMIT 20;
```

## 清理 SQL：修复历史脏数据（可选）

> ⚠️ **强烈建议先在副本上验证**。先备份表，跑完 SELECT 校验再 COMMIT。

```sql
BEGIN;

-- 1. 备份（建议保留 30 天后再删）
CREATE TABLE "ChatMessage_metadata_backup_20260625" AS
SELECT id, metadata FROM "ChatMessage" WHERE role = 'assistant';

-- 2. 修正：把外层 JSON string 拆掉，得到内层 JSONB
UPDATE "ChatMessage"
SET metadata = (metadata #>> '{}')::jsonb
WHERE role = 'assistant'
  AND metadata IS NOT NULL
  AND jsonb_typeof(metadata) = 'string';

-- 3. 校验：再看一次，应该是 0 行
SELECT COUNT(*) AS remaining_string_metadata
FROM "ChatMessage"
WHERE role = 'assistant'
  AND metadata IS NOT NULL
  AND jsonb_typeof(metadata) = 'string';

-- 4. 抽查 5 条确认形态正确
SELECT id, jsonb_typeof(metadata), metadata
FROM "ChatMessage"
WHERE role = 'assistant' AND metadata IS NOT NULL
LIMIT 5;

-- 5. 确认无误后 COMMIT；否则 ROLLBACK
COMMIT;
```

> `jsonb_typeof(jsonb)` 返回 `'string'` 当且仅当顶层是字符串（被双重 stringify 后的形态）。
> `#>> '{}'` 是 `jsonb #>> text[]` 的简写——把 JSONB 当作 text 取出来。
> `::jsonb` 再 cast 回 JSONB。**这是 PG 9.4+ 的标准做法**。

## 后续建议

1. **不要清空消息记录后让用户重发**——本修复已让前端兼容 string + object 两种形态，
   旧消息和未来消息都能正常渲染。
2. **如果要清库**：先跑诊断 SQL 评估脏数据规模，再决定是否跑清理 SQL。
3. **预防**：未来加新字段到 `metadata` 时，确保 Kysely 类型里仍然是
   `Record<string, unknown> | null`，**不要**改回 `string | null`。

## 相关 commit

- `a24c7af` fix(chat): 统一 metadata 写入契约——删 JSON.stringify
- `69dee0e` fix(web): 修复刷新后工具结果丢失——读取端兼容 string + object
