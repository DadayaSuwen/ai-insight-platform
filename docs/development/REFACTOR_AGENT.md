这里为你准备了一份详尽的架构重构文档，风格与项目原有的 `ISSUES.md` 和 `AGENT.md` 保持一致。你可以将其保存为 `docs/development/REFACTOR_AGENT.md`，并在 `README.md` 的开发阶段表中加入 **Phase 10: Agent 架构重构**。

***

# Phase 10: Agent 架构重构 (从路由分类到工具调用)

> 本文档记录了项目从“互斥单选路由”向“大模型原生工具调用”转型的完整过程。这是项目从“Demo 阶段”迈向“企业级应用”的基石。

## 1. 重构背景与痛点

在旧架构中，系统依赖 `RouterAgent` 对用户输入进行 4-way 分类（`sql | chart | analysis | chat`），然后分发到对应的 Agent 执行。随着业务深入，暴露出 5 个致命的架构缺陷：

1. **互斥路由限制表达**：用户输入往往是组合意图（如“查销量并画图”），互斥分类会丢失部分需求。
2. **LLM 越权写 SQL**：让 LLM 直接生成 SQL 导致性能灾难（笛卡尔积）、数据越权、且需繁琐的正则兜底。
3. **前后端强耦合**：SSE 协议基于 `event: sql/chart` 硬编码，LLM 输出格式稍有偏差前端即崩溃。
4. **小模型分类不稳定**：3B/8B 模型对复杂指令的 4-way 分类准确率极低，需依赖脆弱的关键词快路径。
5. **计算与语言错位**：让 LLM 去做同比/环比计算，导致算错数、Token 爆炸和严重幻觉。

## 2. 新架构：基于 Function Calling 的 Planner

彻底废弃 `RouterAgent`，全面拥抱 LangChain 0.3.x 的原生 `bindTools` 能力。LLM 不再是“分类器”，而是“调度中心”。

### 核心架构图

```text
用户输入
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│  PlannerAgent (LLM + bindTools)                            │
│  1. 组装上下文，调用 LLM stream()                           │
│  2. 流式输出文本 -> 实时推送给前端                           │
│  3. 如果返回 tool_calls -> 执行对应 Tool -> 结果回灌 LLM     │
│  4. 循环直到 LLM 不再调用工具，输出最终文本                  │
└──────────────────┬─────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   query_sales  gen_chart   (未来扩展...)
   (结构化查询)  (ECharts拼装)
        │          │
        ▼          ▼
   Prisma 查询   ChartHelper
   (绝对安全)    (纯逻辑生成)
```

## 3. 核心改造点

### 3.1 依赖大升级：统一 LangChain 0.3
废弃了 `@langchain/community` 中的旧版 `ChatOllama`，全量升级至 0.3.x 生态。
- `@langchain/core@^0.3`
- `@langchain/ollama@^0.2` (原生支持 `bindTools`，自动处理 Ollama API 格式转换)

### 3.2 工具结构化
**绝对禁止 LLM 传自然语言给工具，也绝不生成原生 SQL。**

以 `query_sales` 为例，Schema 使用 `z.nullish()` 定义严格的结构化参数：
```typescript
region: z.enum(["华东", "华北", ...]).nullish().describe("销售地区")
```
LLM 负责将“北方区域的销售”提取为 `region: "华北"`，工具内部使用 Prisma 强类型查询，彻底杜绝注入风险。

### 3.3 PlannerAgent 流式 ReAct 循环
使用 `stream()` 替代 `invoke()`，实现真正的流式工具调用。
- **流式分片拼接**：利用 `AIMessageChunk.concat()` 解决流式输出时 `tool_calls` 参数被切碎的问题。
- **硬性熔断机制**：加入 `MAX_ITERATIONS = 5`，防止 LLM 陷入死循环耗尽资源。

### 3.4 纯代码图表生成 (ChartHelper)
将 `ChartAgent` 重构为 `ChartHelper`，移除所有 LLM 调用。
LLM 只决定“画什么图”（通过 `chartType` 参数），ECharts 的 JSON 配置 100% 由 TypeScript 拼装，速度极快且 100% 稳定。

## 4. 前后端通信协议 (SSE 降维)

废弃了 `sql`, `chart`, `analysis` 等业务语义事件，SSE 协议回归纯粹：
- `event: text` -> LLM 吐出的自然语言文本（增量）
- `event: tool_call` -> 通知前端 Agent 正在调用哪个工具
- `event: tool_result` -> 将工具返回的结构化 JSON 丢给前端自行渲染
- `event: done` -> 结束

前端 `MessageBubble` 变成了通用的渲染引擎，不再关心业务 intent，只负责渲染 Markdown、表格和图表。

## 5. 踩过的坑与经验教训

| # | 问题 | 根因与解决 |
|---|------|-----------|
| 1 | **`bindTools` 报错 `SimpleChatModel` 无此方法** | 混用了 0.2.x 的 `@langchain/community`。解决：全量升级至 0.3.x，使用独立的 `@langchain/ollama` 包。 |
| 2 | **`Received tool input did not match expected schema`** | LLM 流式输出时，`args` JSON 被分片返回。解决：使用 `finalMessage.concat(chunk)` 拼装完整的 `tool_calls`。 |
| 3 | **OpenAI 警告 `optional without nullable`** | OpenAI/Ollama 对 Structured Output 要求严格。解决：Zod schema 中将 `.optional()` 全部改为 `.nullish()`。 |
| 4 | **Prisma 报错 `Missing fields: saleDate`** | `groupBy` 查询中，`orderBy` 的字段未包含在 `by` 数组中。解决：改为按聚合字段 `orderBy: { _sum: { amount: 'desc' } }`。 |
| 5 | **打字机效果消失** | `PlannerAgent` 误用了同步的 `invoke()`。解决：改用 `stream()`，并在 `for await` 循环中即时 `yield` 文本片段。 |
| 6 | **空气泡 UI 丑陋** | LLM 思考期间无内容输出，气泡被挤扁。解决：前端增加 `isEmptyThinking` 判断，渲染“三个点”动画。 |

## 6. 架构清理

- 删除 `agents/router.agent.ts` (Router 彻底退出历史舞台)
- 删除 `ai.controller.ts` (废弃非流式的 `/ai/process` 接口)
- 删除工具内部的 `buildWhereClause` 等关键词解析代码，回归 LLM 提参本质。

## 总结

此次重构剔除了“让 LLM 当会计”的反模式，确立了 **“LLM 负责理解与规划，TypeScript 负责计算与安全”** 的架构基调。系统在安全性、扩展性和流式体验上均达到了企业级标准。