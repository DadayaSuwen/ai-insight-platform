# Agent 链路开发文档

本文档描述 Phase 3 的 AI Agent 链路实现。

---

## 整体架构

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│           RouterAgent (路由代理)              │
│  识别用户意图: sql / chart / analysis / chat │
└─────────────────────┬─────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   SqlAgent      ChartAgent    AnalysisAgent
   (SQL生成)     (图表生成)    (分析报告)
        │             │             │
        ▼             ▼             ▼
   执行SQL       生成图表配置    生成分析文字
        │             │             │
        └─────────────┼─────────────┘
                      │
                      ▼
              返回给前端 (SSE)
```

---

## 开发进度

| 步骤 | 状态 | 说明 |
|------|------|------|
| Step 1 | ✅ 完成 | 创建提示词模板 (prompts/) |
| Step 2 | ✅ 完成 | 实现 RouterAgent |
| Step 3 | ✅ 完成 | 实现 SqlAgent |
| Step 4 | ✅ 完成 | 实现 ChartAgent |
| Step 5 | ✅ 完成 | 实现 AnalysisAgent (基础版) |
| Step 6 | ✅ 完成 | 实现 AiService 编排 |
| Step 7 | ✅ 完成 | SSE 流式输出 (Phase 4) |

---

## 文件结构

```
apps/server/src/modules/ai/
├── agents/
│   ├── router.agent.ts         # 意图识别 ✅
│   ├── router.agent.spec.ts   # 意图识别测试 ✅
│   ├── sql.agent.ts          # SQL 生成 ✅
│   ├── sql.agent.spec.ts      # SQL 生成测试 ✅
│   ├── chart.agent.ts        # 图表生成 ✅
│   ├── chart.agent.spec.ts    # 图表生成测试 ✅
│   ├── analysis.agent.ts      # 分析报告 ✅ (基础版)
│   └── index.ts
├── prompts/
│   ├── router.prompt.ts     # 路由提示词
│   ├── sql.prompt.ts         # SQL 提示词
│   ├── chart.prompt.ts       # 图表提示词
│   ├── analysis.prompt.ts    # 分析提示词
│   └── index.ts
├── ai.service.ts            # 核心服务 ✅ (含 7 个测试)
├── ai.service.spec.ts       # AiService 测试 ✅
├── ai.controller.ts         # 控制器
└── ai.module.ts            # 模块
```

---

## 测试覆盖

运行测试: `pnpm test`

| Agent | 测试数 | 状态 |
|-------|--------|------|
| RouterAgent | 15 | ✅ |
| SqlAgent | 15 | ✅ |
| ChartAgent | 14 | ✅ |
| AiService (编排) | 7 | ✅ |
| ChatService (SSE 流) | 7 | ✅ |
| **总计** | **58** | ✅ |

### 测试类型

- **功能测试**: 正常业务流程
- **边界测试**: 空数据、特殊字符
- **安全测试**: SQL 注入防护

---

## 实现细节

### RouterAgent

```typescript
// 意图类型
type IntentType = 'sql' | 'chart' | 'analysis' | 'chat';

// 识别方法
async recognize(message: string): Promise<IntentType>
```

**关键词匹配**:
- `sql`: 查询、数据、销售、统计
- `chart`: 图表、图、可视化、趋势、柱状、饼图
- `analysis`: 分析、洞察、建议
- `chat`: 你好、help (默认)

### SqlAgent

```typescript
// 生成 SQL
async generate(message: string): Promise<string>
```

**支持模式**:
- 按类别: `GROUP BY category`
- 按地区: `GROUP BY region`
- 趋势: `DATE(saleDate)`
- 产品: `productName`
- 总数: `SUM(amount)`
- 平均: `AVG(amount)`
- 最近: `ORDER BY saleDate DESC`

**安全**: 只生成 SELECT，防止 SQL 注入

### AnalysisAgent

```typescript
// 生成分析报告
async generate(data: unknown[], message: string): Promise<string>
```

**当前为模板化实现**:
- 报告数据规模 (记录数 / 字段数)
- 识别数值字段并求 总和/平均/最大/最小
- 完整 LLM 驱动的深度分析由后续 LangChain+Ollama 集成提供

### AiService (编排)

```typescript
// 主入口
async process(message: string): Promise<AiProcessResult>
```

**编排流程**:
1. `RouterAgent.recognize()` → 意图
2. 根据意图分支:
   - `chat` → 直接返回文本
   - `sql` → `SqlAgent.generate` + `DatabaseService.executeQuery`
   - `chart` → + `ChartAgent.generate`
   - `analysis` → + `AnalysisAgent.generate`
3. 全程 try/catch,错误返回 `{ intent, message, error: { code, message } }`

**返回结构 `AiProcessResult`**:
- `intent: IntentType`
- `message: string` (用户可见文本)
- `sql? / executed? / rows?` (SQL 路径)
- `chart?` (chart 路径)
- `analysis?` (analysis 路径)
- `error?` (失败时填充)

**错误码**:
- `INTENT_FAILED` — 意图识别阶段异常
- `PIPELINE_FAILED` — 管道执行异常 (保留原始 intent)

### ChartAgent

```typescript
// 生成 ECharts 配置
async generate(data: unknown[], message: string): Promise<EChartsOption>
```

**支持的图表类型**:
- `bar`: 柱状图 (默认)
- `line`: 折线图
- `pie`: 饼图
- `scatter`: 散点图
- `area`: 面积图

---

## 后续任务

1. **LangChain**: 集成 Ollama 实现 LLM 驱动
2. **Docker 化**: Phase 6
3. **端到端联调**: Phase 5 完成后验证完整链路

---

## 常用命令

```bash
# 运行测试
pnpm test

# 监听模式
pnpm test:watch

# 覆盖率
pnpm test:coverage
```

---

## 测试用例示例

### RouterAgent 测试

```typescript
it('should recognize sql intent for sales query', async () => {
  const result = await agent.recognize('查询销售数据');
  expect(result).toBe('sql');
});

it('should recognize chart intent for bar chart', async () => {
  const result = await agent.recognize('显示柱状图');
  expect(result).toBe('chart');
});
```

### SqlAgent 测试

```typescript
it('should generate SQL for category query', async () => {
  const sql = await agent.generate('按类别显示销售额');
  expect(sql).toContain('GROUP BY');
});

it('should only generate SELECT statements', async () => {
  const sql = await agent.generate('任何查询');
  expect(sql.toUpperCase().startsWith('SELECT')).toBe(true);
});
```

### ChartAgent 测试

```typescript
it('should generate bar chart', async () => {
  const chart = await agent.generate(data, '显示柱状图');
  expect(chart.series[0]).toHaveProperty('type', 'bar');
});

it('should handle empty data', async () => {
  const chart = await agent.generate([], '显示图表');
  expect(chart.series).toBeDefined();
});
```