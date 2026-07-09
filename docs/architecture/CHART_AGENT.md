# ChartAgent 升级架构 (M1-M5, 2026-07-08)

## 目标

将 `gen_chart` 工具从仅支持 5 类 ECharts 系列(bar/line/pie/scatter/area),升级为支持 **全量 ECharts 系列**(核心 18 类 + 3D 7 类 + 扩展插件 2 类 + custom,合计 28 类),同时引入 **5 类架构师硬性护栏** 保障 LLM 输出的安全性与前端渲染的健壮性。

## 总体链路

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 用户自然语言问句 (e.g. "画个热力图看各产品类别每月销量")                  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ SSE /chat/stream
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ apps/server · PlannerAgent (LangChain StructuredTool + bindTools)      │
│   ├─ 选 gen_chart 工具,LLM 生成 GenChartArgsSchema args                │
│   └─ yield { type: "tool_call", data: {...} }                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ tool call
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ apps/server · gen_chart tool (apps/server/src/modules/ai/tools/gen-chart.tool.ts)
│                                                                         │
│  1. SQL 聚合 (Kysely)                                                    │
│     - DIMENSION_BUILDERS (M2 抽出, 14 个 groupBy 维度)                  │
│     - METRIC_SELECTORS × metrics[] (多指标)                             │
│     - [GUARD-4a] 默认时间范围: 未传 timeRange → 近 30 天                │
│     - [GUARD-4b] LIMIT 保护: 未传 topN → LIMIT 1000; groupBy='none'→50 │
│                                                                         │
│  2. ChartAgent.generate(rows, message, ctx)   ← M3                       │
│     - [GUARD-1a] data truncate: rows > 100 → top-100 + prompt 警告     │
│     - [GUARD-3a] prompt 样式隔离: 严禁 color/textStyle/backgroundColor  │
│     - [GUARD-3b] 结构化输出: LlmService.invokeStructured + Zod schema   │
│     - coerceOption: series.type 兜底 + 多 metric 自动展开 + xAxis.data │
│                                                                         │
│  3. ChartValidator.validate(chart, ctx)    ← M3, [GUARD-1b] 防幻觉       │
│     - series.type 白名单 (ECHART_SERIES_TYPES)                          │
│     - [GUARD-1b] 防幻觉: llmValueSet ∩ rawValueSet < 90% → HallucinationError
│     - 体积护栏: >200KB → series.data 截断至 2000 项                    │
│                                                                         │
│  4. 失败 / 幻觉 → ChartHelper.generate(rows, type, group, metrics)     │
│     - M2 多 metric + 双 Y 轴感知                                         │
│     - chartSource = 'fallback'                                           │
│                                                                         │
│  5. return { chart, chartType, chartSource, metrics, metricLabels, groupBy }
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ tool_result (SSE)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ apps/web · MessageBubble.tsx                                            │
│   ├─ chartSource 标签 (M3): 🤖 LLM 生成 / 📊 模板兜底                  │
│   ├─ ChartErrorBoundary 包裹 DynamicChart                               │
│   │   - [GUARD-2a] 阻止 ECharts 异常白屏                                │
│   │   - [GUARD-2b] 异常时显示友好 UI (重试 / 切表格)                    │
│   ├─ DynamicChart (forwardRef)                                          │
│   │   - [GUARD-5a] dark 切换时 key 重建,清理 WebGL context 残留        │
│   │   - dynamic import echarts-gl / liquidfill / wordcloud              │
│   └─ "导出 PNG" 按钮 (M5, GUARD-5b)                                     │
│       - instance.getDataURL({type:'png', pixelRatio:2,                  │
│                                backgroundColor:'#fff'})                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## 支持的 ECharts 系列清单 (28 类)

### 核心 18 类 (echarts 5.x 原生)
- line, bar, pie, scatter, graph, map, gauge, pictorialBar
- radar, tree, treemap, sunburst, boxplot, candlestick, heatmap, parallel, sankey, funnel
- custom (自定义 series)

### 时序
- themeRiver

### 3D 系列 (echarts-gl, M4 引入)
- bar3D, scatter3D, surface3D, map3D, line3D, points3D, lines3D

### 扩展插件 (M4 引入)
- liquidFill (echarts-liquidfill, 水球图)
- wordCloud (echarts-wordcloud, 词云)

## 5 类架构师硬性护栏

| ID | 名称 | 落实位置 | 行为 |
|---|---|---|---|
| **GUARD-1a** | 数据截断 | `chart.agent.ts` generate() 入口 | rows.length > 100 → 截断至 Top-100 + 标记 dataTruncated + prompt 警告 "数据已截断至 Top 100" |
| **GUARD-1b** | 防幻觉校验 | `chart-validator.ts` detectHallucination() | 提取 llm series.data 数值集合 vs raw rows metric 集合,重合度 < 90% → HallucinationError → 降级 ChartHelper |
| **GUARD-2a** | Error Boundary | `ChartErrorBoundary.tsx` (React class) | 包裹 DynamicChart,捕获 ECharts 渲染异常,阻止白屏 |
| **GUARD-2b** | 崩溃兜底 UI | `ChartErrorBoundary.tsx` render | 异常时显示 "图表渲染失败" + 重试按钮 + 切换为表格视图按钮 |
| **GUARD-3a** | 样式隔离 | `chart.agent.ts` CHART_SYSTEM_PROMPT | Prompt 明确禁止 color/textStyle/backgroundColor 等样式字段,样式交由前端主题控制 |
| **GUARD-3b** | 结构化输出 | `chart.agent.ts` invokeStructured 调用 | LlmService.invokeStructured + Zod schema + parseAndValidate,比裸字符串 JSON 鲁棒 |
| **GUARD-4a** | 默认时间范围 | `gen-chart.tool.ts` SQL | 未传 timeRange → 注入近 30 天 filter,防无限制全量聚合拖垮 DB |
| **GUARD-4b** | LIMIT 保护 | `gen-chart.tool.ts` SQL | 未传 topN → LIMIT 1000;groupBy='none' → LIMIT 50 |
| **GUARD-5a** | 实例销毁 | `DynamicChart.tsx` rebuildKey + key prop | dark mode 切换时强制重建组件,清理 WebGL context 残留 |
| **GUARD-5b** | PNG 导出兼容 | `DynamicChart.tsx` useImperativeHandle | instance.getDataURL({type:'png', pixelRatio:2, backgroundColor:'#fff'}),避免 WebGL 黑底 |

## 数据契约

### GenChartArgsSchema (输入)
```ts
{
  region?: '华东'|'华南'|'华中'|'西北'|'全部',
  category?: '家具'|'办公用品'|'电子产品'|'全部',
  timeRange?: '今天'|'本月'|'上月'|'今年'|'全部',  // [GUARD-4a] null → 近 30 天
  groupBy?: 14 个维度 enum,
  metrics?: MetricKey[],                          // 多 metric 支持双 Y 轴
  chartType: string,                              // 任意 ECharts series 类型 (M1 放开)
  topN?: number,                                  // [GUARD-4b] 默认 1000
}
```

### SSEToolResultData.result.chart (输出)
```ts
{
  chart: EChartsOption,        // M1 升级为强类型 schema
  chartType: string,
  chartSource: 'agent' | 'fallback',  // M1 新增 (前端 UI 标签)
  metrics: MetricKey[],
  metricLabels: Record<MetricKey, string>,
  groupBy: DimensionKey,
}
```

### EChartsOption (核心数据契约, M1 新增)
```ts
{
  title?, tooltip?, legend?, xAxis?, yAxis?, grid?, dataset?,
  series: Array<{ type?: string, ... }>,  // 必填非空, type 可由 validator 兜底
  // 其余字段 (dataZoom, visualMap, polar, radar, parallelAxis, geo, ...) .passthrough()
}
```

## 兜底策略 (3 层降级链)

```
LLM 直出 option
  ├─ Zod schema parse 失败 → coerceOption 修复 (series.type / xAxis.data / legend / tooltip)
  ├─ Zod OK 但 [GUARD-1b] 检测幻觉 → throw HallucinationError → catch → ChartHelper.generate()
  └─ LLM 整体异常 (timeout / 截断) → catch → ChartHelper.generate()

ChartHelper.generate()  (M2 多 metric + 双 Y 轴感知)
  ├─ chartType 是支持类型 (bar/line/area/scatter/pie) → 渲染
  └─ chartType 不支持 (heatmap/funnel/radar/sankey/treemap/3D/插件) → warn + bar 模板兜底

ChartAgent.generateFromData()  (M3 模板兜底,补 5 类常用)
  ├─ heatmap/funnel/radar/sankey/treemap → 最小可用模板
  └─ 3D / liquidfill / wordcloud → 不补模板,ChartHelper bar 兜底
```

## 前端按需加载策略 (M4)

- echarts 全量包 (≈1MB) 常驻 bundle (提供 18 类核心)
- echarts-gl (≈250KB) → 用户访问 3D 图前不加载
- echarts-liquidfill (≈25KB) + echarts-wordcloud (≈12KB) → 按需
- vite `manualChunks` 分包到独立 chunk:`echarts` / `echarts-gl` / `echarts-plugins`
- DynamicChart useEffect 检测 series.type → dynamic import 对应 loader
- module-level Promise cache 防 React 18 strict mode 重复 import

## 性能基准

- 复杂 SQL (groupBy=quarter × 5 metrics) p95 ≤ 500ms
- 单图渲染 < 200ms (前端)
- LLM token 消耗: CHART_SYSTEM_PROMPT 升级后 +800 tokens/user msg
- Option 体积: 普通图 < 5KB,ChartValidator 截断阈值 200KB / 2000 项
- Bundle 体积: echarts core chunk < 400KB (gzip) + 扩展按需

## 关键文件

| 角色 | 路径 |
|---|---|
| 类型契约 | `packages/types/src/chat.ts` |
| SQL + 调用链 | `apps/server/src/modules/ai/tools/gen-chart.tool.ts` |
| Zod schema | `apps/server/src/modules/ai/tools/schemas.ts` |
| 维度/指标元数据 (M2 抽出) | `apps/server/src/modules/ai/tools/dimensions.ts` |
| ChartAgent | `apps/server/src/modules/ai/agents/chart.agent.ts` |
| ChartHelper (模板降级) | `apps/server/src/modules/ai/tools/chart.helper.ts` |
| ChartValidator (M3 新增) | `apps/server/src/modules/ai/tools/chart-validator.ts` |
| query_details 复用 | `apps/server/src/modules/ai/tools/query-details.tool.ts` |
| DI 注册 | `apps/server/src/modules/ai/ai.module.ts` |
| Planner | `apps/server/src/modules/ai/agents/planner.agent.ts` |
| 前端渲染 | `apps/web/src/features/chat/components/DynamicChart.tsx` |
| 前端 ErrorBoundary (M4 新增) | `apps/web/src/features/chat/components/ChartErrorBoundary.tsx` |
| 前端扩展包加载 | `apps/web/src/lib/echarts-setup.ts` |
| 前端主题注册 | `apps/web/src/main.tsx` |
| 前端消息渲染 | `apps/web/src/features/chat/components/MessageBubble.tsx` |
| 前端 types | `apps/web/src/features/chat/types.ts` |
| 前端依赖 | `apps/web/package.json` |
| 前端打包 | `apps/web/vite.config.ts` |
| TS shim (M4 新增) | `apps/web/src/types/shims.d.ts` |

## 已知限制与未来工作

1. **3D / liquidfill / wordCloud 模板兜底缺失**: ChartAgent 失败 → ChartHelper bar 兜底,这些类型渲染效果会不理想。后续可补基础模板。
2. **ChartValidator 幻觉检测对 pie/funnel/radar/wordCloud 不参与比对** (这些类型 data 经过 transform)。详见 `chart-validator.ts` 注释。
3. **sankey 单层链路**: 模板只支持 "各节点 → 单个 total" 简单链,复杂层级关系待用户后续 LLM 输出。
4. **ECHART_SERIES_TYPES 是字面量数组**: 新增 ECharts 类型需手动更新 (前后端共用)。
5. **M5 后续清理**: `SSEChartData / SSESQLData / AssistantMessage.{sql,chart,analysis}` @deprecated 字段保留 1 个 release,确认无消费后删除。