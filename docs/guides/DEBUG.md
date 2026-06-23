# 调试指南

> **重要提醒**:`pnpm test` + `pnpm build` 通过 ≠ 系统能跑。真实运行时 (`pnpm start`) 会暴露单元测试看不到的 bug。Phase 3/4/5 共发现并修复了 10 个 bug,详见 [`../development/ISSUES.md`](../development/ISSUES.md)。

## 常见问题

### 数据库连接失败

**问题**: `ECONNREFUSED` 或 `Authentication failed`

**解决**:
```bash
# 检查数据库是否运行
docker ps | grep postgres

# 重新启动
pnpm db:up

# 验证连接
docker exec ai-insight-platform-postgres-1 psql -U app -d ai_insight -c "SELECT 1"
```

### Prisma Client 生成失败

**问题**: `Cannot find module '@prisma/client'`

**解决**:
```bash
cd apps/server
pnpm prisma generate
```

### `@workspace/types` 加载失败 (`ERR_MODULE_NOT_FOUND`)

**问题**: `pnpm start` 报 `Cannot find module '@workspace/types/chat'`

**根因**: types 包以前 `main` 指向源文件,Node 解析不了无扩展名 import。详见 [ISSUES.md #1](../development/ISSUES.md)。

**解决**: types 包已改造为 dual (CJS + ESM) 产物:
- CJS 输出 → `packages/types/dist/cjs/index.js`
- ESM 输出 → `packages/types/dist/esm/index.js`
- `package.json` 用 conditional `exports` 自动选择

```bash
# 如果重新引入这个错误,清掉缓存重 build:
cd packages/types && pnpm build
```

### CORS 错误 (浏览器)

**问题**: `No 'Access-Control-Allow-Origin' header is present on the requested resource`

**根因**: NestJS 默认不开 CORS。详见 [ISSUES.md #3](../development/ISSUES.md)。

**解决**: `apps/server/src/main.ts` 已配置:
```typescript
app.enableCors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
});
```

修改后需重启后端。

### 前端 SSE 重复接收 token

**问题**: UI 一直显示重复 token / SQL / 图表。

**根因**: EventSource 协议默认 3 秒自动重连,服务端 `done` 后关闭 TCP 会触发客户端重连 → 服务端重新跑 pipeline → 死循环。详见 [ISSUES.md #8](../development/ISSUES.md)。

**解决**: `done` 事件时客户端**显式** `eventSource.close()`,阻断自动重连。

### 助手消息重复 (React key 警告)

**问题**: `Encountered two children with the same key`

**根因**: 流式草稿用了 ref + state 双轨管理。详见 [ISSUES.md #6](../development/ISSUES.md)。

**解决**: 助手草稿也直接进 zustand store,单一数据源。

### 前端构建失败

**问题**: TypeScript 错误

**解决**:
```bash
cd apps/web
npx tsc --noEmit  # 查看具体错误
```

### Ollama 连接失败

**问题**: `ECONNREFUSED` on port 11434

**解决**:
```bash
# 启动 Ollama
docker-compose up -d ollama

# 拉取模型
docker exec ai-insight-platform-ollama-1 ollama pull qwen2.5:3b

# 验证
curl http://localhost:11434/api/tags
```

### LLM 超时 / 响应慢

**问题**: `LLM timeout after NNNNms`,或者 chat 接口 hang 几十秒。

**根因**:
- qwen3:8b 模型在 CPU 模式下很慢 (28s+)。默认配置推荐用 `qwen2.5:3b`。
- Ollama 首次加载模型时需要把权重读进内存,首次调用会慢几秒。
- 大 prompt (数据 >50 行) 会显著拖慢响应。

**解决**:
```bash
# 切到快模型 (推荐开发期)
echo "OLLAMA_MODEL=qwen2.5:3b" >> apps/server/.env
pnpm --filter @ai-insight/server dev

# 检查模型是否在 GPU 上跑
ollama ps
```

**超时阈值** 在 `LlmService.invoke()` 调用方控制:
- RouterAgent: 20s (单次分类)
- SqlAgent / ChartAgent: 30s
- AnalysisAgent: 45s (数据 + 报告更长)
- chat 分支: 20s

### LLM 返回纯文本而不是 JSON

**问题**: 后端日志 `LLM returned non-JSON: Unexpected token 's', "sql" is not valid JSON`。

**根因**: 小模型 (qwen2.5:3b) 经常忽略 prompt 里的"返回 JSON"指令,直接吐意图单词 `sql`/`chart`。

**解决**: LlmService 已经内置纯文本兜底 (`coercePlainWord` 方法),自动识别 ZodEnum 的纯单词输出并包装成 `{ intent: 'xxx' }` 通过 schema 校验。**如果还是报错**,说明 LLM 返回的单词不在 ZodEnum 的可选列表里,需要检查 prompt 是否明确列出了所有可能值。

### SQL 报 `relation "xxx" does not exist`

**问题**: LLM 生成的 SQL 写成 `FROM Sales` (没有双引号),PostgreSQL 把未加引号的标识符折叠成小写 → 实际查 `sales` 表,而数据库里是带引号的 `Sales`。

**根因**: LLM 不熟悉 PostgreSQL 的大小写敏感规则。

**解决**: `SqlAgent.assertSafe()` 已经强制 `FROM` 子句必须带双引号表名 (`/FROM\s+"[^"]+"/i`),不满足就抛错触发模板回退。**如果遇到合法 SQL 被误拒**,放宽规则或在 prompt 里更明确强调引号。

### Router 误判 (chart/analysis 被分类为 sql)

**问题**: 用户问"分析趋势"但 Router 返回 `sql` 走纯查询路径,没有 analysis 文案。

**根因**: 3B 模型的 4-way 分类能力有限,对模糊 query 倾向选 `sql`(最常见的兜底)。

**解决**: RouterAgent 已经升级为**混合 Router**:
1. 强关键词 (图表/分析/你好) 走快路径,不调 LLM。
2. 无强关键词才调 LLM,LLM 失败再回退到关键词。

**如果还是误判**,在 `router.agent.ts` 的 `strongKeywordMatch` 里补关键词。

### LLM 模块依赖解析失败 (`Cannot find module '@langchain/core/messages'`)

**问题**: ts-jest 报 `TS2307: Cannot find module '@langchain/core/messages'`。

**根因**: pnpm 严格模式不会把传递依赖提升到子包;`@langchain/core` 是 `langchain` 的传递依赖,不会自动出现在 `apps/server/node_modules` 里。

**解决**: 已显式声明到 `apps/server/package.json`:
```json
"dependencies": {
  "@langchain/core": "^0.2.0",
  "@langchain/community": "^0.2.0",
  ...
}
```
`pnpm install` 即可。

## 日志查看

### 后端日志

```bash
# 容器日志
docker logs ai-insight-platform-server-1

# 实时日志
docker logs -f ai-insight-platform-server-1

# 开发模式
# 直接看终端 stdout,nest start 默认带颜色
```

### 前端日志

浏览器控制台 (F12) 查看。SSE 事件可在 **Network → EventStream** 面板逐条检查:
- `token` / `sql` / `chart` / `analysis` / `error` / `done` 事件顺序
- 是否有漏发或重发

### 数据库日志

```bash
docker logs ai-insight-platform-postgres-1
```

## 调试技巧

### VS Code 调试

1. 安装 **JavaScript Debugger** (内置) 扩展
2. 在 `.vscode/launch.json` 添加配置:
   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "NestJS: debug",
     "runtimeExecutable": "pnpm",
     "runtimeArgs": ["dev:server"],
     "cwd": "${workspaceFolder}/apps/server",
     "console": "integratedTerminal",
     "protocol": "inspector"
   }
   ```
3. 在 `apps/server/src/modules/ai/ai.service.ts` 等处设断点
4. 按 F5 启动,前端正常发送请求即触发断点

### 后端断点调试

```bash
# 启用 Node inspector
cd apps/server
node --inspect-brk=0.0.0.0:9229 dist/main.js
# 然后在 VS Code attach 到 9229 端口
```

### 前端 SSE 调试

```javascript
// 在 useSSEChat.ts 入口加 console.log
eventSource.addEventListener('token', (e) => {
  console.log('[SSE token]', e.data);
});
// 或在浏览器 Network → EventStream 面板看实时事件流
```

## 性能优化

### 数据库查询慢

```sql
-- 分析查询计划
EXPLAIN ANALYZE SELECT * FROM "Sales" WHERE ...;
```

### 前端性能

- 使用 React DevTools Profiler
- 检查网络请求瀑布图
- 启用生产构建进行测试 (`pnpm build` 后 `pnpm preview`)

### SSE 流式输出卡顿

- 检查 `ollama ps` 模型是否在 GPU 上跑 (CPU 模式 8B 模型很慢)
- `num_predict` 设小一点 (单次回复不需要 4096 tokens)
- 检查 `pnpm dev:server` 终端是否有重复日志 (说明有重连 bug)