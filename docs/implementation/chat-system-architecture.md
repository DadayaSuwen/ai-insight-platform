# 对话追问完整系统架构

> 本文档描述原型设计中「对话追问 · 基于已确认的 Schema」功能的完整系统架构。
> 包含：用户流程、前端架构、后端架构、SSE 事件时序、工具调用链路、数据模型。

---

## 一、完整用户流程（从进入页面到获得回答）

### 1.1 用户视角的完整流程

```
用户从工作台点「问 Agent」
    ↓
跳转 /chat/:datasourceId
    ↓
ChatWindow 组件挂载
    ↓
┌─ 并行加载 ─────────────────────────────────┐
│ ① 从 URL 拿 datasourceId → 同步到 chatStore │
│ ② 调 GET /api/datasources/:id → 拉 Schema   │
│    理解（含 tables + relations）              │
│ ③ 调 GET /api/chat/sessions → 拉历史会话列表 │
│ ④ 如果有 currentSessionId → 拉历史消息       │
└────────────────────────────────────────────┘
    ↓
页面渲染：
  左栏：推荐提问 + 可用表列表（从 Schema 理解渲染）
  中间：历史消息（如有）或空状态引导
  右栏：上下文面板（初始为空）
  header：Schema 已确认 badge + 「N 张表 · M 字段 · K 关系」
    ↓
用户输入问题（或点推荐提问）
    ↓
ChatInput 组件 → handleSend(text)
    ↓
useChatActions.sendInCurrentSession(text, ...)
    ↓
如果没有 currentSessionId → 创建新会话（绑定 datasourceId）
    ↓
store.addMessage(userMsg) + store.addMessage(draftAssistant)
    ↓
useSSEChat.sendMessage(text, sessionId)
    ↓
fetch POST /chat/stream { message, sessionId }
    ↓
┌─ SSE 事件流（按时间顺序）──────────────────────────┐
│                                                    │
│ 【第1阶段：LLM 决策】                               │
│ ← event: text  data: { content: "好的，我会..." }  │
│   前端：追加到 draftAssistant.content               │
│   右栏：显示"正在思考..."                           │
│                                                    │
│ 【第2阶段：工具调用】                               │
│ ← event: tool_call data: { id, name, args }        │
│   前端：追加到 draftAssistant.toolCalls             │
│   右栏：工具列表更新                                 │
│   气泡内：显示「🔧 调用工具：query_details」        │
│                                                    │
│ 【第3阶段：工具执行】                               │
│   后端：执行 SQL → 返回 rows                        │
│                                                    │
│ ← event: tool_result data: { id, name, result }    │
│   前端：追加到 draftAssistant.toolResults           │
│   右栏：工具结果更新（N 行）                        │
│   气泡内：渲染 SQL 代码卡片 + 查询结果表格           │
│                                                    │
│ 【第4阶段：LLM 再决策（可能多轮工具调用）】          │
│   后端：把工具结果喂回 LLM → LLM 决定：              │
│     a) 需要更多数据 → 调下一个工具（回到第2阶段）    │
│     b) 数据够了 → 调 generate_insight 生成洞察      │
│     c) 直接输出文字回答                             │
│                                                    │
│ 【第5阶段：洞察生成（如果有数据查询）】              │
│ ← event: tool_call data: { name: "generate_insight" }│
│ ← event: tool_result data: { name: "generate_insight"│
│   result: { summary, insights[], recommendation } } │
│   前端：气泡内渲染 InsightPanel（结构化洞察卡片）    │
│                                                    │
│ 【第6阶段：最终文本回答】                           │
│ ← event: text data: { content: "📊 Top 5 商品分析" }│
│   前端：追加到 draftAssistant.content               │
│   气泡内：Markdown 渲染（含加粗/列表/高亮）         │
│                                                    │
│ 【第7阶段：结束】                                   │
│ ← event: done data: { session, stats }              │
│   前端：标记 draftAssistant.isFinal = true          │
│   右栏：显示 Token 消耗 + 耗时                     │
│   侧栏：更新会话标题 + 时间戳                       │
│                                                    │
└────────────────────────────────────────────────────┘
    ↓
用户看到完整回答：
  ┌ AI 气泡 ─────────────────────────────────────┐
  │ "好的，我会从 order_items 关联 products..."    │
  │                                                │
  │ ┌ 🔧 SQL 查询 ─── 5 行 ─── 286ms ──────────┐ │
  │ │ SELECT p.name, SUM(oi.qty * oi.unit_price) │ │
  │ │ FROM order_items oi                         │ │
  │ │ JOIN orders o ON oi.order_id = o.id         │ │
  │ │ ...                                         │ │
  │ └─────────────────────────────────────────────┘ │
  │                                                │
  │ ┌ 📊 查询结果 ────────────────────────────────┐ │
  │ │ 商品名        销售额     订单数   退货率     │ │
  │ │ 无线耳机Pro   ¥184,320   1,247    2.1%      │ │
  │ │ 智能手表S6    ¥156,840   892      4.8% ⚠️   │ │
  │ │ ...                                         │ │
  │ └─────────────────────────────────────────────┘ │
  │                                                │
  │ ┌ 🧠 商业洞察 ────────────────────────────────┐ │
  │ │ 📊 Top 5 商品销售分析                        │ │
  │ │ 🔴 机械键盘 RGB 退货率 7.4%，远超均值        │ │
  │ │ 💡 建议排查质量问题                          │ │
  │ └─────────────────────────────────────────────┘ │
  │                                                │
  │ 📊 Top 5 商品分析：                             │
  │ • 冠军「耳机Pro」¥18.4 万，退货率仅 2.1%        │
  │ • ⚠️「机械键盘 RGB」退货率高达 7.4%             │
  │ • 「USB-C 集线器」走量为主，退货率 0.8%         │
  │                                                │
  │ 需要我深入分析「机械键盘 RGB」的退货原因吗？     │
  └────────────────────────────────────────────────┘
```

### 1.2 多轮对话流程

```
第1轮：用户问"本月 Top 5 商品"
  → query_details → 结果表格 → generate_insight → 洞察 → 文字总结
  → AI 追问"需要深入分析退货原因吗？"

第2轮：用户回答"深入分析机械键盘 RGB 的退货原因"
  → LLM 看到历史消息（含第1轮的工具调用+结果）
  → 决定调 query_details 查退货订单明细
  → 可能再调 gen_chart 画退货趋势图
  → generate_insight 生成退货原因洞察
  → 文字总结 + 建议

第3轮：用户问"按渠道拆分退货率"
  → LLM 基于上下文知道在说"机械键盘 RGB"
  → 调 query_details 加 channel 维度
  → gen_chart 画各渠道退货率对比柱状图
  → 文字总结
```

---

## 二、前端架构

### 2.1 组件树

```
ChatWindow（路由组件 /chat/:datasourceId）
├── 左栏 aside（240px）
│   ├── 推荐提问卡片
│   │   └── 5 个 SUGGESTED_QUESTIONS 按钮
│   └── 可用表卡片
│       └── schema.tables.map(t => 表名 + 字段数 + 行数)
│
├── 中间 main（flex-1）
│   ├── header
│   │   ├── 返回工作台按钮
│   │   ├── Schema 已确认 badge
│   │   └── 「N 张表 · M 字段 · K 关系」统计
│   │
│   ├── 消息列表（scrollable）
│   │   └── messages.map(m => MessageBubble)
│   │       ├── 用户消息：绿色气泡 + 用户头像
│   │       └── AI 消息：白色气泡 + AI 头像
│   │           ├── ThinkProcess（工具调用时间线，可折叠）
│   │           ├── SqlCodeBlock（SQL 代码，可折叠）
│   │           ├── CollapsibleTable（查询结果表格）
│   │           ├── DynamicChart（ECharts 图表）
│   │           ├── InsightPanel（结构化洞察卡片）
│   │           └── ReactMarkdown（最终文字回答）
│   │
│   └── ChatInput
│       ├── textarea（自动高度，Shift+Enter 换行）
│       ├── 字符计数
│       └── 发送/停止按钮（isLoading 切换）
│
└── 右栏 aside（280px）
    ├── 使用工具（当前轮 toolCalls 列表）
    ├── 数据源（当前 datasourceId）
    ├── 本轮工具结果（toolResults 摘要）
    ├── Token 消耗（输入/输出/合计）
    └── 耗时（总耗时）
```

### 2.2 状态管理

```
useChatStore（Zustand）
├── messages: ChatMessage[]          // 当前会话消息列表
├── currentSessionId: string | null  // 当前会话 ID
├── selectedDataSourceId: string     // 当前数据源 ID（从 URL 同步）
├── sessions: ChatSession[]          // 会话列表（侧栏用）
├── isLoading: boolean               // SSE 流是否进行中
├── error: string | null             // 错误信息
├── theme: 'light' | 'dark'          // 主题
├── sidebarOpen / sidebarCollapsed   // 侧栏状态
│
├── addMessage(msg)                  // 追加消息
├── updateLastAssistant(updater)     // 流式更新最后一条 AI 消息
├── setMessages(msgs)               // 切换会话时替换全部
├── setSelectedDataSourceId(id)     // 设置数据源
└── upsertSession(session)          // 更新会话列表

useDatasourceStore（Zustand）
├── currentDatasourceId              // 全局当前数据源
├── currentDatasourceName            // 数据源名称
├── currentReviewId                  // Schema 纠错 ID
└── setCurrent(id, name)            // 切换数据源

本地 state（ChatWindow 内）
├── schema: SchemaUnderstanding     // 从 API 拉的 Schema 理解
├── stats: { elapsedMs, tokens }    // 从 done 事件拿的统计
└── input: string                   // 输入框内容
```

### 2.3 SSE 客户端（useSSEChat hook）

```
useSSEChat({ onText, onToolCall, onToolResult, onError, onDone })

内部实现：
1. fetch POST /chat/stream { message, sessionId }
   - headers: Authorization: Bearer <token>
   - signal: AbortController（用户点停止时 abort）

2. 用 eventsource-parser 解析 SSE 流
   - 自动处理 CRLF / 多行 data: / UTF-8 chunk 边界

3. 逐事件回调
   - text → onText({ content }) → store.updateLastAssistant 追加文本
   - tool_call → onToolCall({ id, name, args }) → store 追加 toolCalls
   - tool_result → onToolResult({ id, name, result }) → store 追加 toolResults
   - error → onError({ code, message }) → store 标记错误
   - done → onDone({ session, stats }) → store 标记 isFinal + 更新会话

4. 指数退避重连（最多 3 次）
   - 网络抖动自动重连
   - 用户主动 Stop（AbortError）不重连

5. TextDecoder { fatal: true }
   - 遇到非法字节立即抛错而非输出乱码
```

---

## 三、后端架构

### 3.1 请求处理链路

```
POST /chat/stream { message, sessionId }
    ↓
ChatController.stream()
    ├── JwtAuthGuard 校验 token → req.user = { sub, email, role }
    ├── PermissionsGuard 校验 CHAT_QUERY 权限
    ├── 生成 traceId（X-Request-ID）
    └── 调 ChatService.processMessageStream(sessionId, userId, message)
        ↓
ChatService.processMessageStream()
    ├── 1. getMessagesBySessionId(sessionId, userId)
    │   └── 隐式 ownership 校验（session 不归属 → NotFound）
    │
    ├── 2. saveMessage(sessionId, userId, "user", message)
    │   └── 持久化用户消息到 ChatMessage 表
    │
    ├── 3. getSessionById(sessionId, userId)
    │   └── 拿 session.dataSourceId
    │
    ├── 4. resolveDataSourceId(session)
    │   └── null → "" → 后续 PlannerAgent 报 NO_DATASOURCE
    │
    ├── 5. buildHistoryMessages(history)
    │   └── DB 记录 → LangChain BaseMessage[]
    │       ├── user → HumanMessage(content)
    │       ├── assistant → AIMessage({ content, tool_calls })
    │       └── tool_result → ToolMessage({ tool_call_id, content })
    │
    ├── 6. for await (event of AiService.processStream(...))
    │   └── 逐事件 yield 给前端
    │
    ├── 7. saveMessage(sessionId, userId, "assistant", text, { toolCalls, toolResults })
    │   └── 持久化 AI 回答
    │
    ├── 8. touchSession(sessionId, userId)
    │   └── 更新 updatedAt（侧栏排序）
    │
    ├── 9. 如果第一句话 → 自动更新会话标题
    │
    └── 10. yield done { session, stats }
```

### 3.2 PlannerAgent ReAct 循环

```
PlannerAgent.invokeStream(message, history, { sessionId, dataSourceId, currentUserId })
    ↓
1. 校验 dataSourceId（空 → error NO_DATASOURCE）
    ↓
2. 预热 MetadataSnapshot
   └── metadataCache.get(dataSourceId)
       ├── hit → 直接用
       └── miss → metadataService.get(dataSourceId)
           └── executor.introspect() + LLM 语义推断
    ↓
3. buildSystemPrompt(dataSourceId, tools)
   └── 拼接：
       ├── 数据源 ID
       ├── Schema 序列化（表名 + 列名 + 类型 + 中文名 + 语义角色 + 抽样值）
       ├── 4 个工具描述
       ├── 工具选用指引
       ├── 物理名隔离规则
       ├── QueryIntent 字段约定
       ├── 样式/地图/布局规则
       └── 硬性规则（禁止编造/禁止ASCII图/必须生成洞察/禁止硬编码SQL）
    ↓
4. buildTools(currentUserId)
   └── 4 个 StructuredTool：
       ├── query_details（SQL 聚合查询）
       ├── gen_chart（ECharts 图表生成）
       ├── generate_insight（商业洞察生成）
       └── get_table_schema（Schema 探索）
    ↓
5. LLM.bindTools(tools).stream(messages)
    ↓
6. ReAct 循环（最多 30 轮）
   ┌─────────────────────────────────────────┐
   │ while (true) {                           │
   │   iterations++                           │
   │   if (iterations > 30) → error + done    │
   │                                          │
   │   stream = LLM.stream(messages)          │
   │   for await (chunk of stream) {          │
   │     if (chunk.content) → yield text      │
   │     finalMessage = concat(chunk)         │
   │   }                                      │
   │                                          │
   │   if (!finalMessage.tool_calls) {        │
   │     // LLM 没调工具 → 最终回答            │
   │     // 图表关键词补救（注入提示重试一次）  │
   │     break;                               │
   │   }                                      │
   │                                          │
   │   messages.push(finalMessage)            │
   │                                          │
   │   for (toolCall of finalMessage.tool_calls) {│
   │     yield tool_call { id, name, args }   │
   │                                          │
   │     result = tool.invoke({               │
   │       ...args,                           │
   │       dataSourceId,  // 自动注入          │
   │       sessionId,     // 自动注入          │
   │     })                                   │
   │                                          │
   │     yield tool_result { id, name, result }│
   │                                          │
   │     messages.push(ToolMessage(result))   │
   │   }                                      │
   │ }                                        │
   └─────────────────────────────────────────┘
    ↓
7. yield done {}
```

### 3.3 四个工具的职责

```
┌─────────────────────────────────────────────────────────────────┐
│                    query_details                                │
│                                                                 │
│ 输入: { dataSourceId, table, groupBy[], metrics[], filters[], topN }│
│                                                                 │
│ 流程:                                                           │
│   1. ds.getByIdForUser → ownership 校验                         │
│   2. metadata.get → 拿 Schema snapshot                          │
│   3. buildIntent(args) → 构造 QueryIntent                       │
│   4. gateway.executeIntent:                                     │
│      a. validateIntent → 校验列名是否存在于 snapshot             │
│      b. remapChineseToPhysical → 中文名转物理名                  │
│      c. dialect.translate → QueryIntent → SQL                   │
│      d. sqlGuard → 安全校验（只允许 SELECT）                    │
│      e. executor.executeRaw → 执行 SQL                          │
│   5. 返回 { sql, rows, rowCount, metrics, metricLabels, groupByField }│
│                                                                 │
│ 前端渲染: CollapsibleTable（数据表格）                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    gen_chart                                    │
│                                                                 │
│ 输入: { dataSourceId, table, groupBy[], metrics[], filters[],   │
│         chartType?, colorPalette?, mapType?, layout? }          │
│                                                                 │
│ 流程:                                                           │
│   1. 同 query_details 拿到 rows                                 │
│   2. chartAgent.extractIntent:                                  │
│      a. LLM 分析用户意图 → ChartIntent（图表类型+字段映射）      │
│      b. fallback: 关键词推断                                    │
│   3. chartHelper.assemble:                                      │
│      a. 根据 ChartIntent + rows 装配 ECharts option             │
│      b. 26 种图表类型确定性装配（非 LLM 生成）                   │
│   4. 返回 { chart: EChartsOption, rows, chartType, chartSource }│
│                                                                 │
│ 前端渲染: DynamicChart（ECharts 图表）                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    generate_insight                             │
│                                                                 │
│ 输入: { question, data, focus? }                                │
│                                                                 │
│ 流程:                                                           │
│   1. data 为空 → 从 ToolResultContext 取最近一条 query_details  │
│   2. previewData(data) → 格式化数据预览（前 30 行表格）          │
│   3. LLM.invokeStructured:                                      │
│      a. System: "你是资深商业分析师"                             │
│      b. Human: question + 数据预览                              │
│      c. Zod schema 强约束输出                                   │
│   4. 返回 { summary, insights[], recommendation }               │
│      - insights: [{ title, detail, severity, evidence? }]       │
│      - severity: info/warning/opportunity/risk                  │
│                                                                 │
│ 前端渲染: InsightPanel（结构化洞察卡片）                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    get_table_schema                             │
│                                                                 │
│ 输入: { dataSourceId, table }                                   │
│                                                                 │
│ 流程:                                                           │
│   1. metadataCache.get → 拿 snapshot                            │
│   2. 找到指定表的完整列信息                                      │
│   3. 返回 { name, columns: [{ name, rawType, chineseName,       │
│            semanticRole, description, isPK, isFK, sampleValues }]│
│                                                                 │
│ 前端渲染: 不直接渲染（LLM 用它修正查询）                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、SSE 事件时序图

### 4.1 单轮对话（1 次工具调用 + 洞察）

```
前端                          后端                          数据库
  │                             │                             │
  │ POST /chat/stream           │                             │
  │ { message, sessionId }      │                             │
  │────────────────────────────>│                             │
  │                             │                             │
  │                     saveMessage(user)                      │
  │                             │────────────────────────────>│
  │                             │                             │
  │                     getSessionById                         │
  │                     resolveDataSourceId                    │
  │                     buildHistoryMessages                   │
  │                             │                             │
  │                     PlannerAgent.invokeStream              │
  │                     buildSystemPrompt                      │
  │                     LLM.stream(messages)                   │
  │                             │                             │
  │ event: text                 │                             │
  │ data: { content: "好的..." }│                             │
  │<────────────────────────────│                             │
  │                             │                             │
  │                     LLM 返回 tool_calls                    │
  │                             │                             │
  │ event: tool_call            │                             │
  │ data: { id, name:           │                             │
  │   "query_details",          │                             │
  │   args: { table, groupBy,   │                             │
  │     metrics } }             │                             │
  │<────────────────────────────│                             │
  │                             │                             │
  │                     tool.invoke()                          │
  │                     gateway.executeIntent                  │
  │                     → SQL                                   │
  │                     executor.executeRaw                    │
  │                             │────────────────────────────>│
  │                             │<────────────────────────────│
  │                             │     rows (5 行)              │
  │                             │                             │
  │ event: tool_result          │                             │
  │ data: { id, name:           │                             │
  │   "query_details",          │                             │
  │   result: { sql, rows,      │                             │
  │     rowCount: 5 } }         │                             │
  │<────────────────────────────│                             │
  │                             │                             │
  │                     LLM 再决策                              │
  │                     → 调 generate_insight                  │
  │                             │                             │
  │ event: tool_call            │                             │
  │ data: { name:               │                             │
  │   "generate_insight" }      │                             │
  │<────────────────────────────│                             │
  │                             │                             │
  │                     insightAgent.generate                  │
  │                     LLM.invokeStructured                   │
  │                             │                             │
  │ event: tool_result          │                             │
  │ data: { name:               │                             │
  │   "generate_insight",       │                             │
  │   result: { summary,        │                             │
  │     insights, recommendation } }                           │
  │<────────────────────────────│                             │
  │                             │                             │
  │                     LLM 再决策                              │
  │                     → 不需要更多工具                        │
  │                     → 输出最终文本                          │
  │                             │                             │
  │ event: text                 │                             │
  │ data: { content: "📊 Top 5" }│                            │
  │<────────────────────────────│                             │
  │                             │                             │
  │ event: text                 │                             │
  │ data: { content: "商品分析" }│                             │
  │<────────────────────────────│                             │
  │                             │                             │
  │                     saveMessage(assistant)                 │
  │                     touchSession                           │
  │                             │────────────────────────────>│
  │                             │                             │
  │ event: done                 │                             │
  │ data: { session, stats }    │                             │
  │<────────────────────────────│                             │
  │                             │                             │
```

### 4.2 SSE 事件类型汇总

| 事件类型 | data 字段 | 触发时机 | 前端处理 |
|---|---|---|---|
| `text` | `{ content: string }` | LLM 输出文字（流式增量） | 追加到 assistant.content |
| `tool_call` | `{ id, name, args }` | LLM 决定调用工具 | 追加到 assistant.toolCalls |
| `tool_result` | `{ id, name, result }` | 工具执行完成 | 追加到 assistant.toolResults |
| `error` | `{ code, message, traceId? }` | 任何错误 | 标记 assistant.error |
| `done` | `{ session?, stats? }` | 流结束 | 标记 assistant.isFinal + 更新会话 |

---

## 五、数据模型

### 5.1 消息持久化

```
ChatSession
├── id: UUID
├── userId: string (FK → User)
├── dataSourceId: string? (FK → DataSource, nullable)
├── title: string?
├── createdAt: DateTime
└── updatedAt: DateTime

ChatMessage
├── id: UUID
├── sessionId: string (FK → ChatSession)
├── role: "user" | "assistant"
├── content: string (Markdown 文本)
├── toolCalls: JSONB (工具调用数组)
│   └── [{ id, name, args }]
├── toolResults: JSONB (工具结果数组)
│   └── [{ id, name, result }]
├── createdAt: DateTime
└── error: JSONB? (错误信息)
```

### 5.2 前端 ChatMessage 类型

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AssistantMessage extends ChatMessage {
  role: "assistant";
  isFinal: boolean;           // 流是否结束
  toolCalls: ToolCallData[];  // 工具调用列表
  toolResults: ToolResultData[]; // 工具结果列表
  error?: { code: string; message: string };
}

interface ToolCallData {
  id: string;
  name: string;       // query_details / gen_chart / generate_insight / get_table_schema
  args: Record<string, unknown>;
}

interface ToolResultData {
  id: string;
  name: string;
  result: {
    // query_details
    sql?: string;
    rows?: Record<string, any>[];
    rowCount?: number;
    metrics?: string[];
    metricLabels?: Record<string, string>;
    // gen_chart
    chart?: EChartsOption;
    chartType?: string;
    chartSource?: string;
    // generate_insight
    summary?: string;
    insights?: InsightItem[];
    recommendation?: string;
  };
}
```

---

## 六、原型设计的 6 个核心设计原则

### 原则 1：Schema 上下文感知

用户进入对话页时，**必须看到当前数据源的完整概览**：
- header 显示「Schema 已确认」+ 表数/字段数/关系数
- 左栏列出所有可用表（表名 + 字段数 + 行数）
- 推荐提问基于可用表生成

**目的**：让用户知道"我能问什么"，降低提问门槛。

### 原则 2：工具调用过程透明

用户**必须看到 Agent 的完整思考链路**：
- AI 先说"好的，我会从 order_items 关联 products..."
- 然后展示执行的 SQL 代码（可折叠）
- 然后展示查询结果表格
- 最后给出分析文本

**目的**：建立信任——用户知道 Agent 不是在编数据，而是真的查了数据库。

### 原则 3：数据 + 洞察一体

**每次查询必须紧跟洞察生成**（system prompt 硬性规则 #3）：
- query_details / gen_chart → 拿到数据
- generate_insight → 基于数据生成结构化洞察
- 不允许只给数据不给洞察（除非用户明确说"不要分析"）

**目的**：不只是 SQL 查询工具，而是数据分析助手。

### 原则 4：右侧上下文面板

每轮对话**必须透明展示资源消耗**：
- 使用了哪些工具
- 消耗了多少 Token
- 花了多长时间

**目的**：成本可控——用户知道每轮对话花了多少 API 费用。

### 原则 5：多轮对话上下文延续

LLM **必须看到完整历史**（含工具调用和结果）：
- 第1轮查了 Top 5 商品
- 第2轮问"深入分析机械键盘退货原因"
- LLM 从历史知道"机械键盘 RGB"是第1轮的第4名
- 不需要重新查询，直接基于上下文分析

**目的**：像真人分析师一样，记住之前聊过什么。

### 原则 6：安全边界

- **datasourceId 强制校验**：不接受 LLM 从历史提取的其他 id
- **ownership 校验**：session 必须归属当前用户
- **SQL 安全校验**：只允许 SELECT，禁止 DDL/DML
- **字段名校验**：列名必须存在于 MetadataSnapshot

**目的**：多租户隔离 + SQL 注入防护。

---

## 七、与当前实现的差距

| 维度 | 原型设计 | 当前实现 | 差距 |
|---|---|---|---|
| Schema 上下文感知 | header 有统计 + 左栏有可用表 | header 只有 badge，左栏无可用表 | 🟠 P1 |
| 工具调用透明 | SQL 代码卡片可折叠展示 | ThinkProcess 只显示工具名 | 🟡 P2 |
| 数据+洞察一体 | ✅ system prompt 硬性规则 | ✅ 已实现 | ✅ |
| 右侧上下文面板 | 有 Token + 耗时 | 缺少 Token + 耗时 | 🟠 P1 |
| 多轮上下文延续 | ✅ buildHistoryMessages | ✅ 已实现 | ✅ |
| 安全边界 | ✅ ownership + SQL guard | ✅ 已实现 | ✅ |
| datasourceId 链路 | URL → store → session → 后端 | URL → store 链路断裂 | 🔴 P0 |

**结论**：后端架构已经非常完整（ReAct 循环 + 4 工具 + SSE + 多轮持久化），前端缺 4 个展示层补丁（P0 datasourceId + P1 可用表/统计/Token）。

---
*AI生成*
