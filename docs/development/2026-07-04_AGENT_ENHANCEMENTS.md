# Agent 增强:query_details + InsightAgent + ChartAgent 重绑

**日期**: 2026-07-04
**变更类型**: Feature (新工具 + 新 Agent 类 + 重连死代码)

## 背景

原 PlannerAgent 只绑定 2 个工具,功能天花板很低:
- `query_sales` 只能按月/类别/地区聚合,无法看利润/Top-N/明细
- `gen_chart` 标题硬编码,图表样式僵硬
- "洞察"靠 LLM 顺手总结,质量不稳定
- **P0 阻塞**: 种子数据英文,工具 enum 中文,按地区/类别筛选几乎返回 0 行
- 已实现的 `ChartAgent` 死代码,从未绑定

本次增强一次性解决以上所有问题。

## 新增能力

### 1. `query_details` — 明细 / Top-N / 利润分析
- 支持 11 种聚合维度: product / customer / state / city / subCategory / segment / shipMode / day / week / quarter / none(明细行)
- 支持 5 种指标: sales / quantity / profit / discount(平均)/ orderCount(去重)
- 支持 7 种过滤器: region / category / subCategory / state / segment / shipMode / dateFrom~dateTo
- topN 1-100,默认 10;groupBy=none 时强制 ≤ 50(防 SSE 撑爆)
- **策略模式**实现:`DIMENSION_BUILDERS` 映射表,新增维度只需加一条记录
- **强制 limit**:即使 LLM 不传 topN 也默认 10,防止乱传参数

**适用问题**:
- "Top 10 客户按销售额"
- "最亏的 5 个产品子类别"
- "华东电子产品 2017 年的销售"
- "各客户类型订单数对比"

### 2. InsightAgent — 独立 Agent 类 (Agent-as-a-Tool)
- 通过 `generate_insight` 工具暴露给 Planner
- 内部用自己的 LLM pass + 专用 Prompt(资深商业分析师人设)
- 输出结构化 JSON: `{ summary, insights[2-5条], recommendation? }`
- 每条 insight 含: title / detail(引用数字)/ severity(info|warning|opportunity|risk) / evidence

**关键设计**:
- **上下文兜底 (Pitfall #2)**:LLM 不传 data 时,自动从 `ToolResultContext` 拿最近一条 query_sales / query_details 结果
- **降级 (Pitfall #4)**:LLM 输出 schema 失败时返回最小结果,不抛错,前端能看到点东西
- **二次 LLM 调用 30-45s 超时**,不会卡死流

**触发场景**(LLM 在 system prompt 中被教导):
- "为什么..."、"分析一下"、"有什么问题"、"机会"、"风险"、"给我洞察"、"总结"

### 3. ChartAgent 重新绑定
- 原本 `gen_chart` 调 `ChartHelper` (硬编码标题)
- 现在优先调 `ChartAgent` (LLM-driven ECharts config 生成)
- `ChartHelper` 保留作 fallback(LLM 失败时仍能出图)
- 原 `message` 通过 `originalMessage` 注入到 tool args,让 ChartAgent 知道用户意图

### 4. 数据层修复 (P0 阻塞)
- `seed.ts` 增加 `REGION_MAP` / `CATEGORY_MAP`
- CSV 英文 → DB 中文(华南/西北/华中/华东;家具/办公用品/电子产品)
- `schemas.ts` enum 同步缩减到 4 地区 / 3 类别
- 验证:`SELECT DISTINCT region FROM "Customer"` 返回中文 4 行

## 架构改进

### Agent-as-a-Tool 模式
```
PlannerAgent
  ├─ query_sales        (StructuredTool, 不变)
  ├─ query_details      (StructuredTool, NEW)
  ├─ gen_chart          (StructuredTool, NEW: 重绑 ChartAgent)
  └─ generate_insight   (StructuredTool 包装 → InsightAgent 类)
```

### ToolResultContext 服务
- 单例 in-memory,容量 32 条,FIFO 淘汰
- 每次 query 类工具执行后 push 结果
- `generate_insight` LLM 没传 data 时自动兜底

### NestJS DI
- ai.module.ts 注册: `ChartHelper` / `ChartAgent` / `InsightAgent` / `ToolResultContext` / `PlannerAgent`
- planner.agent.ts 注入 6 个依赖(原 3 + 新 3)
- 类型名称 `ChartHelper` 与 `ChartAgent` 不同,NestJS 自动按类型注入,无需字符串 token

## 文件清单

### 新建
- `apps/server/src/modules/ai/agents/insight.agent.ts` — InsightAgent 类
- `apps/server/src/modules/ai/tools/query-details.tool.ts` — query_details 工厂
- `apps/server/src/modules/ai/tools/generate-insight.tool.ts` — generate_insight 工厂
- `apps/server/src/modules/ai/tools/tool-result.context.ts` — 上下文服务
- `apps/web/src/features/chat/components/InsightPanel.tsx` — 洞察渲染组件(含 Skeleton)

### 修改
- `apps/server/prisma/seed.ts` — 中英映射
- `apps/server/src/modules/ai/tools/schemas.ts` — enum 更新 + 新增 3 个 schema
- `apps/server/src/modules/ai/tools/gen-chart.tool.ts` — 调 ChartAgent + Fallback
- `apps/server/src/modules/ai/agents/planner.agent.ts` — 注入新依赖 + 绑定新工具 + 更新 system prompt
- `apps/server/src/modules/ai/ai.module.ts` — 注册新 providers
- `apps/server/src/modules/ai/ai.service.ts` — 透传 sessionId
- `apps/server/src/modules/chat/chat.service.ts` — 把 sessionId 传给 aiService
- `apps/web/src/features/chat/components/MessageBubble.tsx` — query_details / generate_insight 渲染分支 + skeleton
- `apps/web/src/features/chat/components/WelcomeScreen.tsx` — 推荐问题更新

## Planner System Prompt 关键更新

新增【何时使用哪个工具】决策树,强制约束:
- 简单聚合 → query_sales
- Top-N / 明细 / 利润 → query_details
- 商业洞察 / 风险机会 / 原因分析 → **必须先拿数据再调 generate_insight**
- 多工具协同示例(query_details → generate_insight)

## 验证

- ✅ DI 解析:PlannerAgent 4 个工具全部注册
- ✅ query_details smoke test: 6 个 case 全部返回正确数据(利润负数、订单数去重、Top-N、地区/类别筛选)
- ✅ E2E 流式测试:LLM 调用 query_sales → gen_chart → generate_insight,完整链路工作
- ✅ TypeScript 全绿(server + web)
- ⏳ 真实演示:在浏览器中验证 InsightPanel 卡片渲染

## 已知限制

1. **Zod SDK 警告**: OpenAI 严格 JSON Mode 要求所有字段 required,`.default()` 会被警告("This will become an error")。当前用 deepseek-v4-flash 跑通,不影响功能;后续如切到 OpenAI 严格模式需移除所有 `.default()`,把默认值挪到工具内部。
2. **Insights UI Skeleton**: 仅在 `tool_call` 已发但 `tool_result` 未到时显示,生成中(LLM 思考)阶段无视觉反馈;LlmService 内部有 thinking 事件但前端未渲染。
3. **ChartAgent 失败时**: Fallback 到 ChartHelper,标题仍为硬编码(可在后续版本给 ChartHelper 加 context 参数)。

## 后续可能工作

- ReportAgent (export_report) — 生成可下载 Markdown/PDF 报告
- RouterAgent — 显式意图分类路由到不同 agent
- Insights 卡片导出 / 复制 / 收藏
- 大数据集 SSE 流式分块(目前一次性 send)

## 相关文档

- [REFACTOR.md](./REFACTOR.md) — Planner + Function Calling 原始重构
- [REFACTOR_AGENT.md](./REFACTOR_AGENT.md) — 早期 Agent 演进
- [MULTI_TURN_DIALOGUE.md](./MULTI_TURN_DIALOGUE.md) — 多轮对话持久化
- [architecture/SYSTEM.md](../architecture/SYSTEM.md) — 整体架构