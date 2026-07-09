# M8 — gen_chart 调试报告 (2026-07-09)

## 调试环境

- 后端: `http://localhost:3000` (NestJS,正常运行)
- LLM Provider: 已配置 (通过 `POST /llm/config`)
- 数据库: PostgreSQL 16 Superstore 种子 (数据范围: **2014 ~ 2017**)
- 当前时间: **2026-07-09**

## 测试用例结果

| # | prompt | HTTP | 耗时 | tool_call | gen_chart 失败原因 | 根因 |
|---|---|---|---|---|---|---|
| P1 | "各地区销售额对比" | 200 | 12.3s | 3 | 全部 `未查询到相关数据` | **Bug A** |
| P2 | "今年每月销售额趋势" | 200 | 15.8s | 3 | 全部 `未查询到相关数据` | **Bug A** |
| P3 | "电子产品中各类别占比" | 200 | 8.3s | **0** | planner 完全没调工具 | **Bug B** |
| P4 | "所有时间 各地区销售额 画地图" | 200 | 9.1s | **0** | planner 完全没调工具 | **Bug B** |
| P5 | "2017年各地区销售额 画饼图" | 200 | 35.9s | 18 | 17 次 `未查询到数据` + 1 次 `missing FROM-clause entry for table "o"` | **Bug A + Bug C** |

## 三大 Bug

### Bug A — GUARD-4a 默认时间范围与种子数据时间不匹配 (P0,高频)

**位置**: `apps/server/src/modules/ai/tools/gen-chart.tool.ts` L57-75

**问题**:
- 当 LLM 不传 `timeRange` 时,SQL 默认注入"近 30 天" filter (`thirtyDaysAgo`)
- 但数据库种子数据是 **2014-2017**,当前时间 **2026-07-09**
- "近 30 天" = 2026-06-09 ~ 2026-07-09 → **零行**

**验证**:
- P1 "各地区销售额对比" → SQL 0 行 → `未查询到相关数据,无法生成图表`
- P2 "今年每月销售额趋势" → 2026 年无数据 → 同上

**LLM 自己也识别到此问题** (P2 流末尾 text):
> ⚠️ 数据缺口: 数据库目前**只到 2017 年 12 月**,缺少 2018-2025 年的数据

**修复建议**:
1. **方案 A** (推荐): 把默认时间范围从"近 30 天"改成"近 5 年"或"近 10 年",覆盖大多数种子数据时间范围
2. **方案 B**: 数据库种子时间贴近当前时间(更新 seed.ts 把 orderDate 改为 2024-2026)
3. **方案 C**: 默认时间范围改为数据库最大日期前推 N 天(查询 `SELECT MAX(orderDate)` 动态计算)
4. **方案 D**: 检测 DB 数据时间范围,若种子数据远早于当前时间,自动把默认范围调整为数据库整体时间窗

### Bug B — Planner 路由:复杂 prompt 完全不调工具 (P0)

**位置**: `apps/server/src/modules/ai/agents/planner.agent.ts` `invokeStream` + `buildSystemPrompt` L155-180

**问题**:
- P3 "电子产品中各类别占比" 期望 → 调 `gen_chart`
- 实际: **0 个 tool_call**,planner 直接生成 48 个 text event
- P4 "所有时间 各地区销售额 画地图" 同上 → **0 tool_call**

**根因**: PlannerAgent 看到 "复杂 / 模糊 / 包含地名(地图)" 类 prompt 时,**放弃工具调用直接生成文本回答**(可能 LLM 自我判断"无法完成")。没有 fallback 机制强制走工具。

**修复建议**:
1. **方案 A**: PlannerAgent system prompt 强化 — 加 `"用户问图表 / 画 / 趋势 / 占比 / 对比 时必须 gen_chart,严禁纯文本回答"`
2. **方案 B**: 检测 0 tool_call 的情况,如果用户消息包含图表关键词("画"/"图"/"趋势"/"占比"/"对比") → 自动 fallback 到 `gen_chart`
3. **方案 C**: 后置检查 — stream 结束时若 tool_call=0 但 prompt 含图表关键词 → 二次注入 gen_chart 调用

### Bug C — SQL Bug: `missing FROM-clause entry for table "o"` (P0,低频但致命)

**位置**: `apps/server/src/modules/ai/tools/gen-chart.tool.ts` L100-109

**问题**:
```ts
// 4. 应用 dateFilter (需 SalesOrder.orderDate)
if (
  groupField === "region" || groupField === "category" || groupField === "none" ||
  groupField === "month" || groupField === "day" || groupField === "week" || groupField === "quarter"
) {
  qb = qb.where(dateFilter);    // dateFilter 用 o.orderDate,这些 builder 已 join SalesOrder as o
} else {
  qb = qb.innerJoin("SalesOrder as _o_d", "_o_d.id", "s.orderId");  // 别名是 _o_d
  qb = qb.where(dateFilter);     // ← Bug: dateFilter 引用 o.orderDate,_o_d 没起作用
}
```

`dateFilter` 在 L57-75 写死 `o."orderDate"`,但 `else` 分支的 join 别名是 `_o_d`。当 `groupField ∈ {product, subCategory, customer, state, city, segment, shipMode, quarter...}` 中任意一个走 else 分支时,PG 报 `missing FROM-clause entry for table "o"`。

**验证**: P5 18 次 gen_chart 调用中至少 1 次触发此错误。

**修复**:
```ts
// 把 dateFilter 拆成两个版本,或统一别名
} else {
  qb = qb.innerJoin("SalesOrder as _o_d", "_o_d.id", "s.orderId");
  // dateFilter 用 _o_d 别名 (新建一个 _o_d-aware 版本)
  qb = qb.where(sql<boolean>`_o_d."orderDate" >= ${...}`);  // ← 需要重写
}
```

**更简洁方案**: 把 dimensions.ts 中 product / subCategory 等维度的 builder.joins 改为**也 join `SalesOrder as o`**,与 region/month 一致。这样 dateFilter 的 `o."orderDate"` 永远可用。

## 其他观察

1. **M7 TraceLogger 生效**: P5 流期间服务端确实输出了 `controller-entry` / `sql-execute` 等 phase (从响应延迟 35s 推测 LLM 多次重试)
2. **P5 18 次 gen_chart 调用**: planner 在同一会话内反复调 gen_chart,说明 retry 机制工作,但每次都失败
3. **failCountMap 意图直出** (M6-L3): 当前 failCountMap 累计 18 次,但 P5 仍是走 LLM 直出而非切意图直出 — 检查 `>=2` 阈值逻辑

## 改进建议 (优先级)

| 优先级 | Bug | 修复 | 估时 |
|---|---|---|---|
| P0 | Bug A 默认时间范围 | 改 GUARD-4a 默认值 + 加 DB MAX(date) 探测 | 1h |
| P0 | Bug C SQL missing FROM | 改 dimensions.ts builder 统一 join SalesOrder as o | 30min |
| P0 | Bug B planner 不调工具 | 强化 system prompt + 加 chart 关键词检测 fallback | 1h |
| P1 | failCountMap 是否生效 | 加 trace 验证 >=2 切意图 | 30min |
| P2 | chartSource 全为 fallback 比例 | 当前因 Bug A 100% fallback,修后重测 | — |

## 关键文件位置

- `apps/server/src/modules/ai/tools/gen-chart.tool.ts` — Bug A (L57-75) + Bug C (L100-109)
- `apps/server/src/modules/ai/tools/dimensions.ts` — Bug C 修复候选位置 (builder.joins 统一)
- `apps/server/src/modules/ai/agents/planner.agent.ts` — Bug B (buildSystemPrompt L155-180)
- `apps/server/src/modules/ai/agents/chart.agent.ts` — failCountMap (M6-L3) 验证

## 测试日志归档

- `/tmp/p1-b416857e-...log` — 各地区销售额对比
- `/tmp/p2-8e6e8528-...log` — 今年每月销售额趋势
- `/tmp/p3-3687a92f-...log` — 子类别占比 (planner 不调工具)
- `/tmp/p4-d821df8c-...log` — 所有时间 各地区地图 (planner 不调工具)
- `/tmp/p5-4e24ccb1-...log` — 2017年各地区饼图 (18 次 gen_chart 调用)