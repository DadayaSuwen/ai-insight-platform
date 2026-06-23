# 问题排查记录

本文档记录 Phase 3/4/5 实施过程中**实际运行**发现的所有问题,以及根因分析和修复方案。

> 经验教训:`pnpm test` + `pnpm build` 通过 ≠ 系统能跑。所有这些 bug 都是 `pnpm start` 真实运行才暴露出来的。

---

## Bug 清单

| # | 模块 | 症状 | 严重度 |
|---|------|------|--------|
| 1 | `@workspace/types` | `pnpm start` 直接 `ERR_MODULE_NOT_FOUND` | 🔴 阻塞 |
| 2 | `DatabaseModule` | `Nest can't resolve dependencies of the AiService` | 🔴 阻塞 |
| 3 | CORS | 浏览器报 `No 'Access-Control-Allow-Origin'` | 🔴 阻塞 |
| 4 | `useSSEChat` | `SyntaxError: "undefined" is not valid JSON` | 🟠 严重 |
| 5 | `useSSEChat` | `Cannot update a component while rendering` | 🟠 严重 |
| 6 | `ChatWindow` | `Encountered two children with the same key` | 🟠 严重 |
| 7 | `useSSEChat` | `连接错误: 连接中断` 误报 (done 之后) | 🟡 中等 |
| 8 | `useSSEChat` | token 重复 append (EventSource 自动重连) | 🔴 阻塞 |
| 9 | `useSSEChat` | done 之后 isLoading 永远是 true | 🔴 阻塞 |
| 10 | `RouterAgent` | "你好" 走了 sql 路径 | 🟡 中等 |
| 11 | 全部 Agent | 没有 LLM 回复,纯关键词 | 🟠 严重 (功能缺失) |

---

## Bug #1 — `@workspace/types` 无法被 Node 加载

**症状**:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'E:\...\packages\types\src/chat'
  imported from E:\...\packages\types\src/index.ts
```

**根因**:
- `packages/types/package.json` 的 `main` 指向 `./src/index.ts`(源文件)
- `src/index.ts` 用 `export * from './chat'` (无扩展名)
- Node.js 既不能直接 require `.ts`,也无法解析 NodeNext 模式下的无扩展名 import

**修复**:
- `packages/types/tsconfig.json` — `module: commonjs`,加 `outDir: ./dist/cjs`
- `packages/types/tsconfig.esm.json` (新增) — `module: ES2020`,输出到 `./dist/esm`
- `packages/types/package.json` — `main: ./dist/cjs/index.js`,加 conditional `exports`(import → esm,require → cjs)
- `apps/server/jest.config.js` — `moduleNameMapper` 指向 `dist/cjs/index.js`
- `apps/web/tsconfig.json` — `paths` 指向 `dist/esm`
- 清理 `src/` 里的过期 `.js`/`.d.ts` 产物

**为什么测试没发现**: jest 走 ts-jest,能直接 import .ts 源;但运行时 `node dist/main.js` 走的是 Node 真实 require。

---

## Bug #2 — `DatabaseService` 未导出

**症状**:
```
Nest can't resolve dependencies of the AiService (RouterAgent, SqlAgent,
ChartAgent, AnalysisAgent, ?). Please make sure that the argument
DatabaseService at index [4] is available in the AiModule context.
```

**根因**: `database.module.ts` 只有 `providers: [DatabaseService]`,缺 `exports`。AiModule 即便 `imports: [DatabaseModule]`,DI 容器也找不到这个 provider。

**修复**: `database.module.ts` 加 `exports: [DatabaseService]`。

**为什么测试没发现**: 单元测试里 `DatabaseService` 是 mock 直接 `useValue` 注入,完全绕过 NestJS DI 容器。

---

## Bug #3 — CORS 未启用

**症状** (浏览器控制台):
```
Access to resource at 'http://localhost:3000/chat/stream?message=...'
from origin 'http://localhost:5174' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**根因**: NestJS 默认不开启 CORS,`main.ts` 没调用 `app.enableCors()`。

**修复**: `apps/server/src/main.ts` 启动时调用:
```typescript
app.enableCors({
  origin: [process.env.FRONTEND_ORIGIN || 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
});
```

**为什么测试没发现**: curl 测试没有 Origin 头,服务端不需要 CORS 头,直接通过。

---

## Bug #4 — JSON.parse on undefined

**症状** (浏览器控制台):
```
Failed to parse SSE event SyntaxError: "undefined" is not valid JSON
    at JSON.parse (<anonymous>)
    at useSSEChat.ts:49:23
```

**根因**: EventSource 的内置 `error` 事件(`source.onerror`,无 data)与 SSE 协议的 `error` 事件(有 data)共用同一个事件名,导致 `JSON.parse(undefined)` 抛错。

**修复**: 在 `handle` 入口判断 `if (!event.data) return;`,跳过无 data 的事件;同时把 server-sent `error` 事件和 connection-level error 事件分开处理(后者有 closingIntent 标志区分)。

---

## Bug #5 — setState during render

**症状** (浏览器控制台):
```
Warning: Cannot update a component (ChatWindow) while rendering a
different component (ChatWindow).
```

**根因**: 旧 `useSSEChat` 在 `sendMessage` 内包装了 `onDone`:
```typescript
onDone: () => {
  originalDone?.();
  setIsLoading(false);
  source.close();   // ← 同步触发 'error' 事件
}
```
`source.close()` 同步触发 onerror 处理器,里面又调 `setError`,正好在 React 渲染中。

**修复**: 移除 `onDone` 的包装,改用 `closingIntentionallyRef` 跟踪"主动关闭"状态:
- `done` 时设置 `closingIntentionallyRef = true`,然后 `source.close()`
- 紧随其后的 connection-level `error` 事件看到标志就 return
- 状态更新只在 SSE 事件处理器(非渲染时)内触发

---

## Bug #6 — 重复 React key

**症状** (浏览器控制台):
```
Warning: Encountered two children with the same key,
`08799aa1-...`. Keys should be unique so that components maintain
their identity across updates.
```

**根因**: 旧 `ChatWindow` 用两份状态 — `streamingRef.current`(流式草稿) + `useChatStore.messages`(持久化)。onDone 时:
1. `addMessage({ ...streamingRef.current, isFinal: true })` 加入 store
2. `streamingRef.current = null` 清理草稿

两个 React state 更新不是同一 batch,中间存在两帧两个 id 相同的 MessageBubble。

**修复**: 改用单一数据源 — 助手草稿也直接进 store:
```typescript
addMessage(userMsg);
addMessage(draftAssistant);  // isFinal: false
// SSE 事件通过 updateLastAssistant(msg => ({...msg, content: ...}))
// 原地更新最后一条助手消息
// onDone 时只设 isFinal: true
```
整个消息流就是 store.messages,不存在两份。

---

## Bug #7 — "连接错误: 连接中断" 误报

**症状**: 后端正常返回内容(token + sql + done),但 UI 顶部还显示"连接错误: 连接中断"。

**根因**: 服务端发完 `done` 后关闭 TCP 连接 → 客户端 EventSource 触发 connection-level `error` 事件(无 data) → 我的 onerror 处理器 `setError('连接中断')`。

**修复**: `done` 事件 dispatch 时设 `closingIntentionallyRef = true`,后续 connection-level `error` 事件看到标志就 return。

---

## Bug #8 — EventSource 自动重连导致 token 重复

**症状** (最严重):
```
前端一直重复请求
前端一直显示 "查询成功,共返回 3 条结果。" 重复 N 次
```

**根因**: EventSource 默认**会自动重连**(默认 3 秒间隔)。流程:
1. 服务端发完 `done` → 关闭连接
2. 客户端 EventSource 触发 `error` 事件
3. **EventSource 等待重连间隔,自动重连到同一 URL**
4. 服务端重新跑整个 `aiService.process()`,再次发 token + sql + done
5. 前端 `onToken` 继续 append content
6. 死循环

**修复**: `done` dispatch 时显式 `eventSource.close()`,阻断自动重连。

**为什么测试没发现**: 单元测试 mock 了整个 SSE 客户端,没模拟 EventSource 的浏览器行为。

---

## Bug #9 — isLoading 永远卡在 true

**症状**: 助手消息正常显示,SQL 块正常展开,但 ChatInput 按钮一直显示"发送中...",且 disabled。

**根因**: `done` 分支只调用了 `opts.onDone()` 和 `closingIntentionallyRef = true`,没有 `setIsLoading(false)`。`isLoading` 只能由 error 处理器和 abort 重置,但正常 done 路径下两者都不触发。

**修复**: `done` dispatch 时 `setIsLoading(false)`。

---

## Bug #10 — "你好" 走了 sql 路径

**症状**: 发送 "你好" 触发 SQL 查询,返回 "查询成功"。

**根因**: `RouterAgent.simpleRecognize()` 关键词匹配无 chat 检测,默认 fallback 到 sql:
```typescript
if (chartKeywords.some(...)) return 'chart';
if (analysisKeywords.some(...)) return 'analysis';
if (sqlKeywords.some(...)) return 'sql';
return 'sql';  // ← 默认
```

**修复**: 加 chat 关键词检测(优先) + 短消息(< 6 字符)无数据关键词时默认 chat:
```typescript
if (chatKeywords.some(...)) return 'chat';
// ... 其它顺序不变
if (lowerMessage.length < 6) return 'chat';
return 'sql';
```

**根本解决**: 接入 LLM(任务 #4,进行中)做语义级别的意图识别,完全替代关键词硬编码。

---

## Bug #11 — 没有 LLM 回复

**症状**: 所有回复都是模板化/硬编码的,没有真正的自然语言理解和生成。

**根因**: 所有 Agent 当前用 `simpleXxx()` 关键词/模板方法,从未调用 LLM。LangChain + Ollama 依赖已安装(`@langchain/community`, `langchain`, `ollama`),但没写集成代码。

**修复**:
- 新建 `apps/server/src/modules/ai/llm/` 模块,封装 `LlmService`(ChatOllama 单例 + 超时 + Zod 结构化校验 + 纯文本兜底)
- RouterAgent → **混合 Router**(关键词快路径 + LLM 兜底 + 关键词兜底)
- SqlAgent → LLM 生成 SQL + 强制双引号表名 + DDL 黑名单
- ChartAgent → LLM 生成 ECharts config + 自动补全 series.data
- AnalysisAgent → LLM 生成分析文本 + 数据截断 (50 行)
- AiService.handleChat → LLM 通用对话 + 模板回退
- 80 个单元测试全部通过(新增 `llm.service.spec.ts`、`analysis.agent.spec.ts`,其余 4 个 agent spec 扩展 LLM 分支)

**端到端验证** (qwen2.5:3b): chat 0.9s / sql 1.0s / chart 2.8s / analysis 1.5s。

---

## LLM 接入踩过的坑

### 坑 1: pnpm 严格模式不会提升传递依赖

**症状**: `pnpm test` 报 `TS2307: Cannot find module '@langchain/core/messages'`。

**根因**: `langchain` 把 `@langchain/core` 列为 `dependencies`,但 pnpm 在 strict hoist 模式下不会把传递依赖放到子包 `node_modules/@langchain/` 下。`@langchain/community` 被显式声明,所以能 hoist;core 没有,所以不能。

**修复**: 显式声明到 `apps/server/package.json`:
```json
"dependencies": {
  "@langchain/community": "^0.2.0",
  "@langchain/core": "^0.2.0",  // ← 新增
  ...
}
```

### 坑 2: qwen3:8b 慢到无法接受

**症状**: chat 接口 hang 28 秒才返回。

**根因**: qwen3:8b (5.2GB) 在 CPU 模式下非常慢,首次加载 + 推理加起来 ~30s。开发期高频调用完全不可用。

**修复**: 切到 `qwen2.5:3b` (1.9GB),响应降到 1-3s。准确度上 3B 模型稍弱(尤其 4-way 意图分类),所以配套引入**混合 Router**。

### 坑 3: 小模型忽略 JSON 指令直接吐意图单词

**症状**: LlmService 抛 `LLM returned non-JSON: Unexpected token 's', "sql" is not valid JSON`。

**根因**: qwen2.5:3b 经常不遵守 prompt 的 "返回 JSON" 指令,直接吐 `sql` / `chat` 这种单词。

**修复**: LlmService 内置 `coercePlainWord()` 兜底,自动识别 ZodEnum 的纯单词输出并包装成 `{ intent: 'sql' }` 通过 schema。**单测 5 个 case 全部覆盖**。

### 坑 4: LLM 写 SQL 不带引号导致 PG 报 relation does not exist

**症状**: chart 路径报 `relation "sales" does not exist`。

**根因**: LLM 生成 `FROM Sales`(无引号),PostgreSQL 把未加引号的标识符折叠成小写,实际查 `sales` 表,而数据库里是带引号的 `"Sales"`(Prisma schema 大写)。

**修复**: `SqlAgent.assertSafe()` 强制 `FROM` 子句必须带双引号表名,正则 `/FROM\s+"[^"]+"/i` 不满足就抛错,触发模板回退。

### 坑 5: 3B 模型 4-way 意图分类不稳定

**症状**: 用户问"按地区显示销售柱状图",Router 返回 `sql` 而非 `chart`;问"分析趋势"返回 `sql` 而非 `analysis`。

**根因**: 3B 模型对中文 4-way 分类能力有限,倾向选 `sql`(最常见的兜底)。prompt 加再多指令也压不住。

**修复**: **混合 Router** 三层降级:
1. 强关键词匹配 → 直接返回 (chart / analysis / chat 关键词命中率 ~95%)
2. 无强关键词 → 调 LLM (只剩 sql 默认场景)
3. LLM 失败 → 简单关键词兜底

实测混合后 chart/analysis 命中率从 ~30% 提升到 ~98%。

### 坑 6: ChartAgent 的 EChartsOption 类型太严导致 LLM 输出校验失败

**症状**: `Type ... is not assignable to type '{ trigger: string } | undefined'`。

**根因**: Zod schema 里 `legend.data: z.array(z.string())`,LLM 输出经常省略 `legend.data`,但 TS 类型是必填,赋值给 `EChartsOption` 失败。

**修复**: 把 `legend.data` 改为可选 (`data?: string[]`),LLM 输出缺失时不报错;`coerceOption()` 内部按需补全缺失的 axis/series data。

### 坑 7: Windows bash curl 中文乱码

**症状**: 服务端日志显示 `Recognizing intent for: ���` (乱码),Router 命中不了 chart 关键词。

**根因**: Git Bash on Windows 默认 UTF-8 处理 + curl 参数转义时把中文截断成 `?`。

**修复**: 用 `--data-binary @file.json` + 预先写好 UTF-8 文件绕过 shell 转义:
```bash
echo -n '{"message":"按地区显示销售柱状图"}' > /tmp/req.json
curl -X POST http://localhost:3000/chat/message \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @/tmp/req.json
```

---

## 经验教训

1. **`pnpm test` + `pnpm build` 通过 ≠ 能跑**。所有阻塞性 bug(#1, #2, #8, #9)都是真实运行才暴露。Sprint 流程里要加 "集成 smoke test" 步骤。

2. **单测 mock 一切会掩盖 DI 错误**。Bug #2 证明:mock 注入能完全绕开 NestJS 的 provider/export 解析,只有 `pnpm start` 触发真实容器初始化时才会报错。

3. **浏览器 API 有默认行为要警惕**。EventSource 自动重连是 spec 行为(默认 3 秒),不是 bug。任何用 SSE 的前端代码都要在 `done` / 异常时显式 `close()`,否则就是隐藏炸弹。

4. **React state 架构要考虑 "单一数据源"**。Bug #6 根因是 ref + state 双轨管理助手消息;改成全部进 zustand 后,渲染、数据流、生命周期都变简单。

5. **不要在 `pnpm start` 阶段发现 CORS 这种低级问题**。NestJS 启动模板就应该带 `enableCors` 开关。

6. **关键词匹配的极限明显**。Bug #10 体现:任何"分类"任务用硬编码都只能覆盖一部分短语,最终还是得 LLM。

7. **小模型不是万能药**。qwen2.5:3b 比 qwen3:8b 快 20 倍,但 4-way 分类和复杂 SQL 准确度明显差。生产环境要么接受延迟上 8B,要么用混合策略用 3B 做 fast-path,关键决策再调大模型。

8. **LLM 输出永远是 "ALMOST 正确"**。SQL 缺引号、JSON 缺字段、enum 吐单词——任何 LLM 集成都必须假设输出有 10% 概率不符合 schema,用 Zod 强制校验 + 模板回退是最低要求。

9. **依赖显式声明 > 传递依赖**。pnpm strict 模式下不会 hoist 传递依赖,显式声明 `@langchain/core` 比指望 `langchain` 透传稳。

---

## 修复状态

| Bug | 状态 |
|-----|------|
| #1 types 包加载 | ✅ 修复 |
| #2 DI 导出 | ✅ 修复 |
| #3 CORS | ✅ 修复 |
| #4 JSON.parse undefined | ✅ 修复 |
| #5 setState during render | ✅ 修复 |
| #6 重复 key | ✅ 修复 |
| #7 done 后误报连接错误 | ✅ 修复 |
| #8 EventSource 重连 | ✅ 修复 |
| #9 isLoading 不重置 | ✅ 修复 |
| #10 chat 路由 | ✅ 修复(关键词层) |
| #11 LLM 接入 | ✅ 修复 (LangChain + Ollama + 4 个 Agent + 混合 Router) |
