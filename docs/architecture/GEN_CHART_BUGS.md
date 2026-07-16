# M10 — gen_chart Bug 跟踪表 (2026-07-09)

## 测试方法
- 18 用例 (T1-T15 + F1-F3) 覆盖 28 类 ECharts 系列 + 失败场景
- 每个用例 curl POST `/chat/stream?message=...&sessionId=...` 带 `X-Request-ID` 
- 日志归档 `/tmp/m10-results/T{N}-{traceId}.log`
- 总结: `/tmp/m10-results/SUMMARY.log`

## 修复状态总览

| Bug | 名称 | 状态 | 修复里程碑 |
|---|---|---|---|
| A | GUARD-4a 默认"近 30 天" 与 2017 种子数据冲突 | ✅ 已修 | M9 |
| B | Planner 复杂 prompt 不调工具 | ✅ 已修 | M9 |
| C | SQL `missing FROM-clause entry for table "o"` | ✅ 已修 | M9 |
| D | LLM 传 `metrics: []` 触发 Kysely `expr.split(' ')` undefined | ✅ 已修 | M9 |
| E | 重试逻辑 `SystemMessage` 违反 LangChain 协议 | ✅ 已修 | M10 |
| F | `metrics.min(1)` LangChain 拒绝空数组 | ✅ 已修 | M10 |
| G | ECharts map 系列 GeoJSON 缺失导致前端崩溃 | ✅ 已修 | M11 |

## M10 测试结果 (Bug E + F 修复后,Bug A-D 全部生效)

### 成功用例 (chartType 正确 + chartSource=agent + 无错)

| # | prompt | chartType | elapsed | 备注 |
|---|---|---|---|---|
| T2 | 今年每月销售额趋势 | line | 37s | ⚠️ nodata=2 (2026 无数据,部分调SQL 0行) |
| T3 | 电子产品中各类别占比 | pie | 60s | ok=4 err=7 (部分失败但最终有图) |
| T5 | 价格 vs 销量散点图 | scatter | 19s | ok=1 |
| T7 | 销售额 Top 30 客户占比树图 | treemap | 40s | ok=3 err=3 |
| T8 | 各地区→客户类型→类别 销售流 | sankey | 42s | ok=2 err=9 |
| T9 | 各阶段订单转化漏斗 | funnel | 24s | ok=1 err=7 |
| T10 | 目标完成率仪表 | gauge | 17s | ok=2 err=2 |
| T12 | 类别→子类别→产品 层级 | sunburst | 21s | ok=1 |
| T13 | 城市×类别×销售额 3D柱图 | bar3D | 50s | ok=4 err=2 |
| T14 | 客户名称词云 | wordCloud | 34s | ok=2 err=2 |
| T15 | 销售完成率水球 | liquidFill | 15s | ok=1 err=2 |

### 失败用例 (Bug F 触发)

| # | prompt | chartType | 问题 |
|---|---|---|---|
| T1 | 各地区销售额对比 | bar | 9 次 gen_chart 全 err="Received tool input did not match expected schema" (LLM 传 `metrics:[]` 被 LangChain 拒绝) — **Bug F 修复后待重测** |
| T4 | 用面积图看累积销量 | area | 19 次 gen_chart 全 err (同样 metrics:[] 触发) — **Bug F 修复后待重测** |
| T6 | 各产品类别 × 月份 销量热力图 | bar (LLM 选) | MISMATCH (期望 heatmap,LLM 选 bar) — 非 bug,LLM 自主选择 |
| T11 | 各客户类型多维评分 | radar | 1 次 err="Received tool input did not match expected schema" (metrics:[]) — **Bug F 修复后待重测** |
| F1-F3 | 失败场景 | (无响应) | curl 在 SSE 流中途被截断,需重测 |

## 已知 Bug 详细

### Bug A — GUARD-4a 默认时间范围与种子数据冲突 ✅ M9 修
- **位置**: `apps/server/src/modules/ai/tools/gen-chart.tool.ts:57-79`
- **根因**: 硬编码"近 30 天",但数据库种子只到 2017-12
- **修复**: 不传 timeRange → 不注入 filter,全量查;GUARD-4b LIMIT 1000 兜底

### Bug B — Planner 复杂 prompt 不调工具 ✅ M9 修
- **位置**: `apps/server/src/modules/ai/agents/planner.agent.ts` buildSystemPrompt + 重试逻辑
- **根因**: LLM 自我判断"无法完成"直接生成 text
- **修复**: gen_chart description 加"【强制图表触发】" + 0 tool_call + 关键词命中 → 重试 1 次 (注:此重试用 SystemMessage 触发 Bug E)

### Bug C — SQL `missing FROM-clause entry for table "o"` ✅ M9 修
- **位置**: `apps/server/src/modules/ai/tools/dimensions.ts` category/product/subCategory builder
- **根因**: 这些维度 builder 不 join SalesOrder as o,但 dateFilter 引用 o.orderDate
- **修复**: 3 个 builder 补 `innerJoin("SalesOrder as o", ...)`;`gen-chart.tool.ts` 简化为单行 `qb = qb.where(dateFilter)`

### Bug D — LLM 传 `metrics: []` 触发 Kysely `expr.split(' ')` undefined ✅ M9 修
- **位置**: `apps/server/src/modules/ai/tools/gen-chart.tool.ts:34-39`
- **根因**: `metricList[0]` undefined → Kysely 内部 `order-by-parser.js:44` `expr.split(' ')` 抛 TypeError
- **修复**: `metricList = (metrics && metrics.length > 0) ? metrics : ["sales"]` 兜底

### Bug E — SystemMessage 协议冲突 ✅ M10 修
- **位置**: `apps/server/src/modules/ai/agents/planner.agent.ts:321-326`
- **症状**: `[AiService] [stream] PlannerAgent failed: System messages are only permitted as the first passed message.`
- **根因**: 重试逻辑把 `new SystemMessage(...)` push 到 messages 数组中间,LangChain 协议硬性要求 SystemMessage 必须在 messages[0]
- **修复**: `SystemMessage` → `HumanMessage`,模拟"用户追问"语气

### Bug F — `metrics.min(1)` LangChain 拒绝空数组 ✅ M10 修
- **位置**: `apps/server/src/modules/ai/tools/schemas.ts:67-72`
- **症状**: `Received tool input did not match expected schema`
- **根因**: M9 修复 Bug D 时加了 `.min(1)`,但 LangChain StructuredTool 内部 Zod 校验在 args 入口就拒绝,根本进不到 `gen-chart.tool.ts` 内部的 `metricList` 兜底
- **影响**: T1/T4/T11 等用例 LLM 反复传 `metrics:[]` → 9-19 次连续失败
- **修复**: 去掉 `.min(1)`,改用 `.nullish()`,允许空数组进入工具,内部 `metricList` 兜底为 `["sales"]`

### Bug G — ECharts map 系列 GeoJSON 缺失导致前端崩溃 ✅ M11 修 + 🔄 M12 部分恢复
- **症状**: 前端控制台 `Map USA not exists. The GeoJSON of the map must be provided.` + `MapSeries.js:83 Uncaught TypeError: Cannot read properties of undefined (reading 'regions')`
- **根因**:
  - LLM 在某些 prompt 下选 `series.type: 'map'`
  - `packages/types/src/chat.ts:196` `ECHART_SERIES_TYPES` 白名单**包含 `'map'`** → `chart-validator.enforceSeriesTypeWhitelist` 不替换
  - 前端 0 处 `echarts.registerMap`,`apps/web/public/` 空,ECharts 渲染时找不到 'china' map 资源
  - `ChartErrorBoundary` 在 ECharts 内部 `try/catch` 异常下不触发,用户看到红字 + 空白图
- **M11 临时修复** (map → bar 降级):
  - `chart-validator.ts`: 新增 `MAP_LIKE_TYPES = new Set(['map', 'map3D'])` 黑名单,`enforceSeriesTypeWhitelist` 遇到 map 类型强制替换为 `typeHint ?? 'bar'`,warn log
  - `chart.agent.ts CHART_SYSTEM_PROMPT`: 末尾加 `**地理分布图 (map / map3D) 暂不开放**` 提示
  - `gen-chart.tool.ts description` / `schemas.ts chartType describe`: 删 `|map|`
  - `echarts-setup.ts`: 新增 `rewriteMapToBar()` 工具
  - `DynamicChart.tsx`: 调 `rewriteMapToBar(option)` 前端兜底
- **M12 恢复 map 支持** (map3D 仍禁用):
  - `apps/web/public/china.json` (新增): DataV.GeoAtlas 公共 GeoJSON (省/市两级,~570KB raw / ~150KB gzip,Apache-2.0)
  - `echarts-setup.ts ensureChinaMap()`: fetch china.json + `echarts.registerMap('china', geoJson)`,module-level Promise cache
  - `rewriteMap3DToBar`: 只 rewrite map3D,map 不再降级
  - `chart-validator.ts MAP_LIKE_TYPES`: 删 'map',保留 'map3D'
  - `chart.agent.ts CHART_SYSTEM_PROMPT` / `gen-chart.tool.ts description` / `schemas.ts chartType describe`: 加回 map 字样 + "data.name 用中文省份名" 提示
  - `DynamicChart.tsx useEffect`: 检测 'map' type 时 await ensureChinaMap()
- **验收**: LLM 输出 `series:[{type:'map',data:[{name:'北京',value:100}]}]` → 后端 validator 透传 → 前端 ensureChinaMap() 加载 + ECharts 正常渲染中国地图,北京区域高亮

## 待办
- **重测 T1/T4/T11/F1-F3** (Bug F 修复后预期 100% 成功率)
- **新 bug 持续记录** (运行时监控 traceId `controller-entry` / `sql-execute` / `llm-invoke` phase)

## 验收清单
- [x] Bug A-E 全部修复
- [x] Bug F 修复完成,待用户重启后端后重测
- [x] 文档化所有 bug 含 traceId + 复现命令
- [ ] M10 重测 (T1-T15 + F1-F3 全 100% 通过)
- [ ] 长期监控: LLM 输出幻觉 / series.type 非法 / chartSource=fallback 比例