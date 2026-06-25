# LLM 配置持久化 & 多轮对话上下文修复

> 日期：2026/06/25
> 分支：`fix/llmconfig-persistence-and-multi-turn-context`
> 关联：Prisma → Kysely 收尾 / 多轮对话上下文丢失 / `tool_call_id` 跨轮重复 400

本文档汇总 2026-06-25 修复的 6 个后端 Bug，涵盖 **LLMConfig 持久化**、**多轮对话上下文**、**工具调用 id 校验** 三条主线。所有改动在 `fix/llmconfig-persistence-and-multi-turn-context` 分支上拆为 **3 个 commit** 推送。

---

## 一、TL;DR

| 症状 | 根因 | 修复 |
|------|------|------|
| 后端启动报 `Invalid prisma.lLMConfig.findUnique()` | `llm.service.ts` 残留 `new PrismaClient()`，且 Prisma 客户端从未生成 | 把 LLMConfig 访问迁到 Kysely，删除整个 `core/prisma/` 目录 |
| `POST /llm/config` 报 `null value in column "updatedAt"` | Prisma 把 `@updatedAt` 编译成 NOT NULL 列 + UPDATE 触发器，**无列默认值** | Kysely 类型用 `Date`（非 `Generated<Date>`），保存时显式 `new Date()` |
| **单次会话内** LLM 不知道上一句说了什么 | `planner.agent.ts` 用 `h.role` 判断 LangChain `BaseMessage` 实例，永远 false → history 被静默丢弃 | `history: BaseMessage[]` + `...history` 展开；同时把 `saveMessage(user)` 挪到 `getMessagesBySessionId` 之后，避免重复 |
| LLM API 400 `Duplicate value for 'tool_call_id' of query_sales` | Ollama 复用的 `toolCall.id` 就是函数名，跨 turn 重复 | 保存时 `randomUUID()` 写入 `metadata.toolCalls[i].id` 与 `toolResults[i].id`，重建时按 saved id 配对，**不依赖数组下标** |
| 存量老数据有同样的 400 风险 | 老 metadata 没有 `id` 字段 | 加一次性 SQL `one-time-fix-tool-call-ids.sql`（`gen_random_uuid() + WITH ORDINALITY`），或直接 TRUNCATE |
| 死代码 | `PrismaService` 注册在 `AppModule` 但全代码库无人用 | 删除 `core/prisma/` 整个目录 |

---

## 二、整体架构

改动集中在后端，前端 / DB schema / Kysely 表结构均无破坏性变更。

```
apps/server/src/
├── core/
│   ├── kysely/types.ts         ← 加 LLMConfigTable，createdAt/updatedAt 改为 Date
│   └── prisma/                 ← 整个目录删除 (prisma.service.ts / prisma.module.ts / index.ts)
├── modules/
│   ├── ai/
│   │   ├── ai.service.ts       ← processStream(historyMessages: BaseMessage[]) 透传类型
│   │   ├── agents/planner.agent.ts
│   │   │   ← invokeStream(history: BaseMessage[])，删 dict 转换循环，改用 spread
│   │   └── llm/
│   │       ├── llm.module.ts   ← imports 加 DatabaseModule
│   │       └── llm.service.ts  ← Prisma → Kysely，注入 DatabaseService
│   ├── chat/chat.service.ts    ← 调换 save/load 顺序 + saved id 配对 tool_call/result
│   └── app.module.ts           ← 移除 PrismaModule
└── prisma/
    └── one-time-fix-tool-call-ids.sql  ← 新增：存量数据迁移
```

---

## 三、Commit 拆分

| # | SHA | Type | 文件 | 关注点 |
|---|-----|------|------|--------|
| 1 | `e66ef88` | refactor(llm) | `app.module.ts`, `kysely/types.ts`, `core/prisma/*` (删), `llm/{module,service}.ts` | Prisma → Kysely + 删死代码 + `@updatedAt` 修复 |
| 2 | `f6ccd2d` | fix(chat) | `planner.agent.ts`, `ai.service.ts`, `chat.service.ts` | 多轮上下文 + tool_call_id UUID |
| 3 | `2c221de` | chore(prisma) | `one-time-fix-tool-call-ids.sql` (新) | 存量数据回填脚本 |

---

## 四、Bug 详情

### Bug 1：后端启动报 `Invalid prisma.lLMConfig.findUnique()`

**现象**（来自原 session 启动日志）：

```
ERROR [LlmService] Failed to init LLM from DB, falling back to Ollama
ERROR [LlmService] PrismaClientInitializationError: 
Invalid `prisma.lLMConfig.findUnique()` invocation in
apps/server/src/modules/ai/llm/llm.service.ts:286:42
```

**根因**：

1. 项目运行时的查询引擎是 **Kysely**（`DatabaseService` 用 `Kysely<Database>` + `pg.Pool`），Prisma 客户端**从未生成过**（`node_modules/.prisma/client/` 目录不存在）。
2. `llm.service.ts` 三处直接 `new PrismaClient()` 访问 `LLMConfig` 表：
   - `reload()` 里的 `prisma.lLMConfig.upsert(...)` (line 220)
   - `getAllConfigs()` 里的 `prisma.lLMConfig.findMany()` (line 253)
   - `initFromDatabase()` 里的 `prisma.lLMConfig.findUnique(...)` (line 286)
3. 全代码库 `@prisma/client` import 只在 `prisma.service.ts`（死代码）和 `llm.service.ts` 两处。
4. `apps/server/src/core/prisma/prisma.service.ts` 注册在 `AppModule` 是 `PrismaModule` 提供的全局模块，启动时调 `this.$connect()` 也会因为 `node_modules/.prisma/client` 不存在抛错。

**修复**：

- `llm.service.ts`：注入 `DatabaseService`（NestJS DI），用 Kysely 的 `db.insertInto("LLMConfig").onConflict().execute()` 等替代 Prisma 调用
- `llm.module.ts`：`imports: [ConfigModule, DatabaseModule]`
- `app.module.ts`：移除 `PrismaModule` 导入
- **删除整个 `core/prisma/` 目录**（`prisma.service.ts` / `prisma.module.ts` / `index.ts`）
- `kysely/types.ts`：新增 `LLMConfigTable` 接口

> 注：`schema.prisma` 和 `seed.ts` 仍保留 —— `seed.ts` 用 `PrismaClient` 跑迁移和数据导入，不在 Nest 运行时内。`@prisma/client` 和 `prisma` 仍是 devDependency 级别的依赖。

---

### Bug 2：`POST /llm/config` 报 `null value in column "updatedAt"`

**现象**：

```
ERROR [ExceptionsHandler] null value in column "updatedAt" of relation "LLMConfig" violates not-null constraint
```

**根因**：

Prisma 的 `@updatedAt DateTime` 字段**没有列默认值**。它被编译成：

1. `NOT NULL` 列（无 `DEFAULT` 子句）
2. 一个 `BEFORE UPDATE` 触发器，在每次 UPDATE 时写 `CURRENT_TIMESTAMP`

Kysely 类型用 `Generated<Date>` 意味着"DB 自动生成"——但 Prisma 的 `@updatedAt` 列**没有默认值**。所以 Kysely 生成的 INSERT 语句**完全省略** `updatedAt` 列，PG 收到空值 → 触发 NOT NULL 约束。

**修复**（`core/kysely/types.ts` + `llm.service.ts`）：

```ts
// kysely/types.ts —— 改为应用层写
export interface LLMConfigTable {
  id: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  temperature: number;
  // 注意：Prisma 把 `updatedAt @updatedAt` 编译成 NOT NULL 列 + UPDATE 触发器，
  // 没有列默认值。所以必须由应用层写入，Kysely 的 `Generated<T>` 不适用。
  createdAt: Date;
  updatedAt: Date;
}

// llm.service.ts reload() —— 显式 new Date()
const now = new Date();
await db.insertInto("LLMConfig").values({
  id: config.provider,
  apiKey: config.apiKey ?? null,
  baseUrl: config.baseUrl ?? null,
  model: config.model,
  temperature: config.temperature,
  createdAt: now,
  updatedAt: now,
}).onConflict((oc) =>
  oc.column("id").doUpdateSet({
    ...same,
    updatedAt: now,   // UPDATE 时也写，Prisma 触发器会再覆盖一次
  }),
).execute();
```

> 提一句：`createdAt` 实际上 PG 列有 `DEFAULT now()`，可以用 `Generated<Date>` 跳过。但为了一致性和代码可读性，统一用 `Date` 应用层写入。

---

### Bug 3：多轮对话 LLM 上下文丢失

**现象**：用户在同一个 session 内连续发 3 条消息，LLM 只能看到当前一条，前面的对话全忘。

**根因**（`apps/server/src/modules/ai/agents/planner.agent.ts:167-190`）：

`chat.service.ts` `buildHistoryMessages()` 已经把 DB 记录**直接转成 LangChain 实例**：

```ts
new HumanMessage(record.content)
new AIMessage({ content: "", tool_calls: ... })
new ToolMessage({ tool_call_id, name, content: ... })
```

但 `planner.agent.ts` `invokeStream` 收到 `history` 后还在用**老 dict 协议**检查：

```ts
for (const h of history) {
  if (h.role === "user") ...              // h.role === undefined → false
  else if (h.role === "assistant" && h.tool_calls) ...
  else if (h.role === "tool") ...
  else if (h.role === "assistant") ...
}
```

LangChain `BaseMessage` **没有 `.role` 属性**（只有 `_getType()` 返回 `"human" | "ai" | "tool"`），所以**四个分支永远不命中**，`history` 在拼接到 `messages` 之前被完全丢弃。

这是 `feat(ai): 从分类路由 → 工具调用 Planner 架构重构` 这次重构的**契约没对齐**——`chat.service.ts` 已经切到"返回 LangChain 实例"，但 `planner.agent.ts` 还在用老 dict 协议。

**修复**（`planner.agent.ts`）：

```ts
async *invokeStream(
  message: string,
  history: BaseMessage[] = [],  // ← 改成 BaseMessage[]
): AsyncGenerator<PlannerStreamEvent, void, unknown> {
  // ...
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...history,                  // ← 直接展开，不再循环转换
    new HumanMessage(message),
  ];
  // 后续 messages.push(finalMessage) / messages.push(new ToolMessage(...)) 不动
}
```

**顺带修一个次要问题**（`chat.service.ts`）：

`processMessageStream` 原本是 **先** `saveMessage(user)` **再** `getMessagesBySessionId`，导致 history 里**包含当前用户消息**；修了主 bug 后，`invokeStream` 又会在末尾 `new HumanMessage(message)` 追加一次 → 连续两条相同 HumanMessage。

调整顺序为 **先拉历史、再保存当前消息**：

```ts
// 1. 先拉历史（不含当前用户消息）
const history = await this.sessionService.getMessagesBySessionId(sessionId);
const historyMessages = this.buildHistoryMessages(history);

// 2. 再保存当前用户消息
await this.sessionService.saveMessage(sessionId, "user", message);

// 3. 消费流
for await (const event of this.aiService.processStream(message, historyMessages)) { ... }
```

`ai.service.ts` 透传类型同步为 `BaseMessage[]`：

```ts
async *processStream(
  message: string,
  historyMessages: BaseMessage[] = [],
): AsyncGenerator<...> {
  // ...
  yield* this.plannerAgent.invokeStream(message, historyMessages);
}
```

---

### Bug 4：LLM API 400 `Duplicate value for 'tool_call_id'`

**现象**：

```
ERROR [AiService] [stream] PlannerAgent failed: 400 Duplicate value for 'tool_call_id' of query_sales in message[9]
```

**根因**：

Ollama 给 `toolCall.id` 用的是**函数名**（如 `"query_sales"`），不是 OpenAI 那种 UUID（`"call_xyz123"`）。

如果 LLM 在**同一 turn 内**调用 `query_sales` 两次（比如按不同区域各查一次），两条 `tool_call.id` 都是 `"query_sales"`。保存到 `ChatMessage.metadata` 后，下次重建时 LLM API 严格校验 `tool_call_id` 全局唯一 → 400。

**修复**（`chat.service.ts`）：

**保存时**给每个 tool_call 生成真 UUID，复用同一 id 给对应 tool_result：

```ts
import { randomUUID } from 'crypto';

let pendingToolCallId: string | null = null;
// ...
} else if (event.type === "tool_call") {
  // Ollama 复用的 id 是函数名，跨 turn 会重复 → 洗成真 UUID
  pendingToolCallId = randomUUID();
  assistantToolCalls.push({ id: pendingToolCallId, ...event.data });
} else if (event.type === "tool_result") {
  // planner 严格按序发射 tool_call → tool_result，复用同一 id
  assistantToolResults.push({ id: pendingToolCallId ?? randomUUID(), ...event.data });
  pendingToolCallId = null;
}
```

**重建时**用 saved id 配对 `AIMessage.tool_calls[].id` 与 `ToolMessage.tool_call_id`：

```ts
// AIMessage
tool_calls: toolCalls.map((tc) => ({
  id: tc.id,        // ← 直接用 saved UUID，跨 turn 唯一
  name: tc.name,
  args: tc.args,
  type: "tool_call",
})),

// ToolMessage —— 按 saved id 配对，不是下标
for (const tr of toolResults) {
  if (!tr.id) continue;   // 老数据兼容：没有 id 就跳过
  messages.push(new ToolMessage({
    tool_call_id: tr.id,
    name: tr.name,
    content: JSON.stringify(tr.result),
  }));
}
```

**为什么不按数组下标配对**：未来 planner 改为并发工具调用或部分失败重试时，下标会错位。`saved id` 是最稳定的配对方式。

---

### Bug 5 & 6：死代码 / 存量数据

**Bug 5**：`PrismaService` / `PrismaModule` 全代码库无人用，但 `AppModule` 还导入了。

**修复**：直接删除 `apps/server/src/core/prisma/` 整个目录（`prisma.service.ts` / `prisma.module.ts` / `index.ts`）。`@prisma/client` 仍作为 devDependency 保留（`seed.ts` 用）。

**Bug 6**：修复 Bug 4 之前，老的 `ChatMessage.metadata` 里 `toolCalls[*]` 和 `toolResults[*]` 都没有 `id` 字段。即使前端代码已经更新，这些老数据触发 400 还是会发生。

**修复**：写一次性迁移 SQL `apps/server/prisma/one-time-fix-tool-call-ids.sql`，用 `gen_random_uuid() + WITH ORDINALITY` 给存量数据补 id。文件末尾有 TRUNCATE 注释选项（推荐：直接清空更快）。

执行：

```bash
psql "$DATABASE_URL" -f apps/server/prisma/one-time-fix-tool-call-ids.sql
# 或者解开文件底部 TRUNCATE 那行的注释重跑

# 直接清空（本次采用的方案）
psql -c 'TRUNCATE "ChatSession" CASCADE;'  # 清掉了 2 个 session / 24 条 message
```

---

## 五、关键文件

| 文件 | 改动类型 | 关注点 |
|------|---------|--------|
| `apps/server/src/app.module.ts` | 改 | 移除 `PrismaModule` |
| `apps/server/src/core/kysely/types.ts` | 改 | 新增 `LLMConfigTable`，`createdAt/updatedAt` 用 `Date` |
| `apps/server/src/core/prisma/{index,prisma.module,prisma.service}.ts` | **删** | 死代码 |
| `apps/server/src/modules/ai/agents/planner.agent.ts` | 改 | `history: BaseMessage[]` + `...history` |
| `apps/server/src/modules/ai/ai.service.ts` | 改 | 透传类型 |
| `apps/server/src/modules/ai/llm/llm.module.ts` | 改 | 导入 `DatabaseModule` |
| `apps/server/src/modules/ai/llm/llm.service.ts` | 改 | Prisma → Kysely + `randomUUID()` 时间戳 |
| `apps/server/src/modules/chat/chat.service.ts` | 改 | 顺序调换 + `randomUUID()` tool_call id + saved id 配对 |
| `apps/server/prisma/one-time-fix-tool-call-ids.sql` | **新** | 一次性数据迁移 |

---

## 六、端到端验证清单

| # | 操作 | 预期 |
|---|------|------|
| 1 | `pnpm db:up && pnpm db:seed` | DB 启动 + 种子数据 OK |
| 2 | `pnpm dev:server` | 启动日志**没有** `Failed to init LLM from DB`，`LlmService loaded config` 正常出现 |
| 3 | `curl -X POST http://localhost:3000/llm/config -H "Content-Type: application/json" -d '{"provider":"ollama","model":"qwen2.5:3b","temperature":0,"baseUrl":"http://localhost:11434"}'` | `{"ok":true,...}` 200 OK |
| 4 | `curl http://localhost:3000/llm/config` | 返回 3 条 config（anthropic/openai/ollama），无 500 |
| 5 | 前端开新会话，发"销售额最高的 3 个产品是什么？" | 触发 `query_sales` 工具，返回 Top 3 |
| 6 | 紧接发"第二个产品的销售趋势呢？" | LLM **能识别"第二个"指代的是上一轮排名第二的产品**，触发 `query_sales` 查该产品 |
| 7 | 同一会话内连续两轮都触发 `query_sales` | 第二轮 LLM 收到的历史里 `tool_call_id` 都是真 UUID，**没有 400 Duplicate value** |
| 8 | `cd apps/server && npx tsc --noEmit` | 0 错误 |
| 9 | 旧会话（修复前产生）查看 | 加载历史时如果遇到没 `id` 的老数据，`if (!tr.id) continue` 安全跳过，不阻塞整段 |

---

## 七、设计决策记录

### 7.1 为何用 `Date` 而非 `Generated<Date>`

`Generated<T>` 在 Kysely 的语义是"DB 自动生成"。`@default(now())` 列确实是 DB 自动生成（PG 有列默认值），但 `@updatedAt` 是 Prisma 特殊处理：列本身**没有默认值**，靠 `BEFORE UPDATE` 触发器。

强行把 `updatedAt` 标成 `Generated<Date>` 会让 Kysely 生成的 SQL **省略这个字段**，PG 收到 INSERT 时该列无值 → NOT NULL 约束违反。

**正确做法**：应用层负责写入。`reload()` 时用 `new Date()` 写两个时间戳，简单可靠。

### 7.2 为何不在 planner 层加 id 兜底

考虑过在 `planner.agent.ts` 收到 `toolCall.id` 缺失或重复时本地生成一个 UUID 兜底（类似 `tc_${Date.now()}_${++counter}`），但有两个问题：

1. **运行时 id 与持久化 id 不一致**：planner 这次生成的 UUID，下次重建历史时又要重算，无法稳定跨 turn 唯一
2. **不符合 LLM 协议**：`tool_call_id` 应该是 LLM 自己给的；本地兜底会让消息看起来"不一致"

最终方案：**保存时一次性洗成 UUID 写进 metadata**，重建时直接读 saved id，零状态。

### 7.3 为何 TRUNCATE 而不是跑迁移 SQL

两个选择：

- **跑 `one-time-fix-tool-call-ids.sql`**：保留历史，兼容性最好。但只清理了 `toolCalls.id`，其他潜在 JSONB 数据形态问题（`metadata` 双编码 JSON 字符串等）不解决
- **直接 `TRUNCATE "ChatSession" CASCADE`**：从干净状态开始，趁机测试新 schema 在全新数据上的行为

本次采用 TRUNCATE。开发环境会话本来就少（2 session / 24 message），保留价值低。**生产环境** 上线前如果存在真实数据，必须先跑迁移 SQL，**绝对不能 TRUNCATE**。

---

## 八、PR 链接

分支已推送：https://github.com/DadayaSuwen/ai-insight-platform/pull/new/fix/llmconfig-persistence-and-multi-turn-context

3 个 commit：
- `e66ef88` refactor(llm): 把 LlmService 从 Prisma 迁到 Kysely
- `f6ccd2d` fix(chat): 修多轮对话上下文丢失 + tool_call_id 跨轮重复 400
- `2c221de` chore(prisma): 加 tool_call UUID 一次性迁移 SQL
