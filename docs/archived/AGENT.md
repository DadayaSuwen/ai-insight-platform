# Agent 链路开发文档

> 本文档反映 Phase 3 完成后 + **LLM 接入 (#11)** 后的真实实现。
> 历史问题与解决方案见 [`ISSUES.md`](./ISSUES.md)。

## 整体架构

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│        RouterAgent (混合路由代理)            │
│  ┌──────────────────────────────────────┐  │
│  │ 1. 关键词快路径  (chart/analysis/chat) │  │  ← 不调 LLM
│  │ 2. LLM 调用       (sql 默认)          │  │  ← LlmService
│  │ 3. 简单关键词    (LLM 失败兜底)        │  │
│  └──────────────────────────────────────┘  │
└─────────────────────┬───────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   SqlAgent      ChartAgent    AnalysisAgent       chat
   (LLM+回退)   (LLM+回退)    (LLM+回退)         (LLM)
        │             │             │
        ▼             ▼             ▼
   SQL 安全校验   ECharts 补全    截断 50 行
   强制引号表名  series.data      → LLM
        │             │             │
        ▼             ▼             ▼
   执行 SQL     返回图表配置    返回分析文本
        │             │             │
        └─────────────┼─────────────┘
                      │
                      ▼
              返回给前端 (SSE)
```

## 开发进度

| 步骤 | 状态 | 说明 |
|------|------|------|
| Step 1 | ✅ 完成 | 创建提示词模板 (prompts/) |
| Step 2 | ✅ 完成 | 实现 RouterAgent |
| Step 3 | ✅ 完成 | 实现 SqlAgent |
| Step 4 | ✅ 完成 | 实现 ChartAgent |
| Step 5 | ✅ 完成 | 实现 AnalysisAgent |
| Step 6 | ✅ 完成 | 实现 AiService 编排 |
| Step 7 | ✅ 完成 | SSE 流式输出 (Phase 4) |
| Step 8 | ✅ 完成 | **LLM 接入** (LlmService + LangChain + Ollama) |

## 文件结构

```
apps/server/src/modules/ai/
├── llm/                          ★ LLM 基础设施
│   ├── llm.service.ts                ChatOllama 封装 + 超时 + Zod 结构化
│   ├── llm.service.spec.ts           LlmService 单测 (JSON 解析 / 纯文本兜底)
│   ├── llm.module.ts                 LlmModule (DI 容器)
│   ├── llm.mock.ts                   测试用 mock 工厂
│   └── index.ts
├── agents/
│   ├── router.agent.ts             ★ 混合 Router (关键词 + LLM)
│   ├── router.agent.spec.ts
│   ├── sql.agent.ts                ★ LLM 生成 SQL + 安全校验
│   ├── sql.agent.spec.ts
│   ├── chart.agent.ts              ★ LLM 生成 ECharts + 补全
│   ├── chart.agent.spec.ts
│   ├── analysis.agent.ts           ★ LLM 生成分析文本
│   ├── analysis.agent.spec.ts      ★ 新增
│   └── index.ts
├── prompts/
│   ├── router.prompt.ts            ★ 强化版 (4-way 分类 + 示例)
│   ├── sql.prompt.ts
│   ├── chart.prompt.ts
│   ├── analysis.prompt.ts
│   └── index.ts
├── ai.service.ts                  ★ chat 分支接 LLM
├── ai.service.spec.ts
├── ai.controller.ts
└── ai.module.ts                   ★ imports LlmModule
```

## LlmService 设计

```typescript
// 纯文本调用 (chat / analysis)
await llm.invoke({
  system: '...',
  human: '...',
  timeoutMs?: 60_000,
  temperature?: 0,
});

// 结构化调用 (router / sql / chart),Zod 自动校验
await llm.invokeStructured({
  system: '...',
  human: '...',
  schema: z.object({ intent: z.enum(['sql','chart','analysis','chat']) }),
  timeoutMs?: 20_000,
  temperature?: 0,
});
```

**关键行为**:

- **ChatOllama 单例**: 进程内一个客户端,避免每次调用都重新加载模型。
- **超时**: 通过 `Promise.race` 强制超时,Ollama HTTP 客户端某些版本不暴露 per-request timeout。
- **JSON 提取**: 自动剥掉 ```json``` markdown fence 和周围 prose。
- **Zod 校验**: schema 不匹配时抛错,Agent 捕获后回退到模板。
- **纯文本兜底** (`coercePlainWord`): 小模型 (qwen2.5:3b) 经常忽略 JSON 指令直接吐 `sql`/`chat`,LlmService 自动识别 ZodEnum 纯单词并包装成 `{ intent: 'sql' }` 通过 schema。

## RouterAgent — 混合策略

```typescript
async recognize(message: string): Promise<IntentType> {
  // 1. 关键词快路径 (0 LLM 开销)
  const fastPath = this.strongKeywordMatch(message);
  if (fastPath) return fastPath;

  // 2. LLM 调用 (Zod enum 强制类型)
  try {
    const { intent } = await this.llm.invokeStructured({
      system: ROUTER_SYSTEM_PROMPT,
      human: buildRouterUserMessage(message),
      schema: z.object({ intent: z.enum([...]) }),
      timeoutMs: 20_000,
    });
    return intent;
  } catch (err) {
    // 3. LLM 失败 → 简单关键词兜底
    return this.simpleRecognize(message);
  }
}
```

**为什么需要混合策略**: 3B 模型 4-way 分类能力有限,对模糊 query 倾向选 `sql` 或 `chat`。关键词快路径能稳定覆盖 chart/analysis/chat,LLM 只需要处理剩余的 sql 默认场景。

**关键词优先级** (按顺序匹配,首个命中即返回):
1. chart: `图表|图|可视化|柱状|折线|饼图|散点|面积|chart|graph|plot`
2. analysis: `分析|洞察|为什么|原因|预测|建议|趋势分析|analyze|why|insight`
3. chat: `你好|hello|hi|help|帮助|谢谢|thank`

## Agent 统一模式

每个 Agent 都是**三层降级**:

```
LLM 调用 → 解析/校验 → 模板回退 → 抛错到 AiService
```

| Agent | LLM 成功 | LLM 失败回退 | 关键校验 |
|-------|---------|------------|---------|
| **RouterAgent** | Zod enum intent | simpleRecognize 关键词 | enum 严格匹配 |
| **SqlAgent** | 提取 SQL 字符串 + 校验 | simpleGenerate 模式匹配 | SELECT-only, DDL 黑名单, 必须带 `"Sales"` 引号 |
| **ChartAgent** | Zod EChartsOption | generateFromData 模板 | series.data 缺失时补全 |
| **AnalysisAgent** | 纯文本 (50 行截断) | templateGenerate 统计 | 截断防止 prompt 爆炸 |
| **chat (in AiService)** | 通用对话 prompt | fallbackChatMessage | 超时回退 |

## 测试覆盖

运行 `cd apps/server && pnpm test`:

| 文件 | 测试数 | 状态 |
|------|--------|------|
| `llm.service.spec.ts` | 5 | ✅ |
| `router.agent.spec.ts` | 14 (含 LLM 路径 + 回退) | ✅ |
| `sql.agent.spec.ts` | 14 (含 LLM + 危险 SQL 拦截) | ✅ |
| `chart.agent.spec.ts` | 14 (含 LLM + 默认补全) | ✅ |
| `analysis.agent.spec.ts` | 5 (新增) | ✅ |
| `ai.service.spec.ts` | 8 (含 LLM mock + chat 回退) | ✅ |
| `chat.service.spec.ts` | 3 | ✅ |
| **总计** | **80** | ✅ |

### 测试类型

- **功能测试**: 正常业务流程
- **LLM 成功路径**: mock LlmService 返回期望值
- **LLM 失败路径**: mock 抛错,验证回退逻辑
- **安全测试**: SQL 注入 / DDL 拦截
- **边界测试**: 空数据、特殊字符、超时

## 端到端验证

启动 server (`pnpm start`) 后用 curl 测 4 个意图:

```bash
# chat (~1s)
curl -X POST http://localhost:3000/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'

# sql (~1s) — LLM 生成 SQL,自动校验,DB 执行
curl -X POST http://localhost:3000/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message":"按类别显示销售额"}'

# chart (~3s) — LLM 生成 SQL + ECharts config
curl -X POST http://localhost:3000/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message":"按地区显示销售柱状图"}'

# analysis (~2s) — LLM 生成 SQL + 自然语言报告
curl -X POST http://localhost:3000/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message":"分析最近的销售趋势"}'
```

## 常见命令

```bash
# 运行测试
cd apps/server && pnpm test

# 监听模式
pnpm test:watch

# 覆盖率
pnpm test:coverage

# 切换模型
# 编辑 apps/server/.env 的 OLLAMA_MODEL,重启 server
```

## 后续任务

1. **Docker 化**: Phase 6
2. **LLM streaming**: 当前 LLM 调用是全量返回,未来可以改成逐 token 流式 (ChatOllama.stream())
3. **Prompt 调优**: 根据真实使用数据持续优化 router/sql/chart prompt
4. **更多模型**: 支持 OpenAI/Claude 作为云端备选