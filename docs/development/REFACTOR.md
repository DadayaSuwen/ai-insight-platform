# 架构重构：从分类路由 → 工具调用 Planner

> 重构日期：2026/06/23
> 提交：`642a682`

---

## 一、重构背景与目标

### 旧架构的问题

现有架构使用 **互斥单选路由** (`RouterAgent`)：
- 用户输入 → 4-way 意图分类 (`sql | chart | analysis | chat`) → 单一分支处理
- 三层降级：关键词快路径 → LLM → 关键词兜底 → 模板回退
- 真实用户输入几乎都是**组合意图**（如"按地区显示柱状图并分析趋势"需要 SQL + 图表 + 分析），互斥分类必然导致部分意图丢失

### 目标

将 LLM 从"分类器"改为"规划器"：
- 单个 LLM + `bindTools([4个工具])` 自主决定调用哪些工具
- 工具执行结果回灌给 LLM，LLM 自己决定下一步
- 彻底消除关键词路由和模板回退

---

## 二、架构变化

### 旧流程

```
用户输入
    ↓
RouterAgent.recognize()  ← LLM 4-way 分类
    ↓
SqlAgent | ChartAgent | AnalysisAgent | ChatHandler
    ↓
数据库 / LLM / 模板回退
```

### 新流程

```
用户输入 + schema context
    ↓
PlannerAgent.invokeStream()  ← ChatOpenAI / ChatAnthropic.bindTools([4个工具])
    ↓
LLM 返回 tool_calls
    ↓
逐个执行工具 (query_sales / gen_chart / gen_analysis / small_talk)
    ↓
工具结果回灌 → 再次调用 LLM
    ↓
LLM 返回 content → 流式 SSE 输出
```

---

## 三、新增文件

### `apps/server/src/modules/ai/tools/`

| 文件 | 工具名 | 职责 |
|------|--------|------|
| `query-sales.tool.ts` | `query_sales` | 生成 SQL + 执行查询，返回 `{ sql, rows, rowCount }` |
| `gen-chart.tool.ts` | `gen_chart` | SQL + ECharts 图表配置，返回 `{ sql, rows, chart, chartType }` |
| `gen-analysis.tool.ts` | `gen_analysis` | SQL + 分析报告，返回 `{ sql, rows, analysis }` |
| `small-talk.tool.ts` | `small_talk` | 闲聊/问候，直接调用 LLM，返回 `{ reply }` |
| `index.ts` | — | 导出 `PLANNER_TOOLS` 数组 |

所有工具使用**工厂函数**（而非继承 `Tool` 类），避免 LangChain 0.2.x `Tool` 基类 `schema` 受保护属性的类型问题。

### `apps/server/src/modules/ai/agents/planner.agent.ts`

- `PlannerAgent` — 核心工具调用循环
  - `refreshSchema()` — 从数据库动态加载 schema 注入 system prompt
  - `invokeStream()` — `AsyncGenerator<PlannerStreamEvent>` 执行循环
  - `emitBackwardCompat()` — 确保工具结果同时发出 `sql`/`chart`/`analysis` 事件，向后兼容前端

---

## 四、SSE 事件扩展

### 新增事件类型 (`packages/types/src/chat.ts`)

```typescript
export enum SSEEventType {
  // 原有
  TOKEN = 'token', SQL = 'sql', CHART = 'chart',
  ANALYSIS = 'analysis', ERROR = 'error', DONE = 'done',
  // 新增
  TOOL_CALL = 'tool_call',   // "正在调用 query_sales..."
  TOOL_RESULT = 'tool_result', // "查询到 42 条记录"
  THINKING = 'thinking',     // 可选：LLM 中间思考
}
```

### PlannerAgent 发出的完整事件序列

```
tool_call → tool_result → sql/chart/analysis → token → done
```

### 向后兼容

`emitBackwardCompat()` 确保旧前端（依赖 `onSQL`/`onChart`/`onAnalysis` 回调）的组件无需修改即可继续工作。

---

## 五、前端改动

### `useSSEChat.ts`
- 新增 `onToolCall` / `onToolResult` 回调选项
- dispatch switch 新增 `TOOL_CALL` / `TOOL_RESULT` case

### `types.ts`
- `AssistantMessage` 新增 `toolCalls[]` / `toolResults[]` 字段

### `MessageBubble.tsx`
- 新增 `ToolCallCard` — 显示"正在调用 {tool}…"
- 新增 `ToolResultBadge` — 显示"查询到 N 条记录 ✓"

### `ChatWindow.tsx`
- 接入 `onToolCall` / `onToolResult` → `updateLastAssistant`

---

## 六、删除的文件

| 文件 | 原因 |
|------|------|
| `agents/router.agent.ts` | 意图分类被 LLM 工具选择替代 |
| `agents/router.agent.spec.ts` | 已被 `ai.service.spec.ts`（新架构测试）替代 |

`SqlAgent` / `ChartAgent` / `AnalysisAgent` **保留** — 它们被工具内部调用，逻辑不变。

---

## 七、遇到的问题与解决

### 1. LangChain `Tool` 基类 schema 受保护

**问题**：`Tool` 子类用 `this.schema = z.object({...})` 赋值，TS 报错"无法赋值给只读属性"。

**解决**：不继承 `Tool` 类，直接返回 `{ name, description, _call }` 普通对象。LangChain 的 `bindTools` 接受任何有 `name` + `description` + `_call` 的对象。

---

### 2. 联合类型推导为 `never`

**问题**：`emitBackwardCompat()` 返回 `PlannerStreamEvent[]`，在 if 内 `events.push({ type: 'chart', data: {...} })` 时，TS 推导结果为 `never`。

**原因**：`PlannerStreamEvent` 是 9 个成员的联合类型，TS 交叉推导失败。

**解决**：将 chart 分支结果**单独断言**后 push：
```typescript
const chartEvent = { type: 'chart' as const, data: { chartType, data: { option: chart, rows } } };
events.push(chartEvent as PlannerStreamEvent);
```

---

### 3. types 包无法构建

**问题**：`packages/types/tsconfig.json` 中 `"ignoreDeprecations": "6.0"` 在用户环境 TypeScript 版本中无效。

**解决**：降级为 `"ignoreDeprecations": "5.0"`。

---

### 4. Jest worker 崩溃 (OOM)

**问题**：`ai.service.spec.ts` 测试模块初始化时，`PlannerAgent` 被 NestJS DI 容器实例化为真实对象（而非 mock），导致构造时调用真实 `LlmService`，最终因无法连接 LLM API 而崩溃。

**解决**：在测试 `beforeEach` 中显式覆盖 `PlannerAgent` provider 为 mock 对象，确保 NestJS 不实例化真实类。

---

### 5. `mockRejectedValue` 用于 AsyncGenerator

**问题**：`plannerAgent.invokeStream.mockRejectedValue(new Error(...))` — `mockRejectedValue` 仅适用于 Promise，AsyncGenerator 需要返回一个会抛出错误的 generator。

**解决**：
```typescript
async function* throwingGen(): AsyncGenerator<PlannerStreamEvent> {
  throw new Error('LLM unavailable');
}
plannerAgent.invokeStream.mockReturnValue(throwingGen());
```

---

### 6. `PlannerStreamEvent` 联合类型在数组字面量中推导失败

**问题**：`mockPlannerStream([{ type: 'chart', data: {...} }, ...])` 中 TS 推导联合类型为 `never`。

**解决**：将 `plannerAgent` 声明为 `any` 类型，绕过了 `PlannerStreamEvent` 联合类型的严格检查。

---

## 八、验证结果

| 指标 | 结果 |
|------|------|
| Server TS 编译 | ✅ 通过 |
| Web TS 编译 + Vite build | ✅ 通过 (`✓ built in 11.91s`) |
| Server 单元测试 | ✅ **5 suites / 59 tests passing** |
| RouterAgent 删除验证 | ✅ `router.agent.ts` 已删除 |
| 向后兼容 | ✅ `emitBackwardCompat` 保证旧 SSE 事件仍发出 |

---

## 九、后续优化建议

1. **模型 tool_calls 支持度检测**：运行时检查 `response.tool_calls` 是否存在，若模型不支持则回退到纯 chat 模式
2. **Schema 动态注入**：`PlannerAgent.refreshSchema()` 可在每次请求前从 `information_schema` 重新加载
3. **并行工具执行**：第一版严格串行，后续可改为 `Promise.all()` 并行执行无依赖的工具调用
4. **工具错误重试**：目前工具失败后错误被注入 LLM，但 LLM 是否重试取决于模型能力；可增加显式重试逻辑
