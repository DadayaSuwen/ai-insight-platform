# Fix-1 · 救论文 4 创新点后端

> **执行前提**：已读完 `CLAUDE-v2.md`，理解角色与禁止行为
> **预计耗时**：3-4 天
> **目标**：让论文 4 个创新点（置信度门控 / 对话纠错 / 自动工作台 / 主动洞察）后端 demo-ready

---

## Task 1.0 · 创建验证脚本基础设施

### 定位
无（新建）

### 输出

创建 `docs/implementation/verification/` 目录及以下 4 个空脚本（Fix-1 到 Fix-4 各一个）：

```
docs/implementation/verification/
├── check-fix-1.sh
├── check-fix-2.sh
├── check-fix-3.sh
└── check-fix-4.sh
```

每个脚本初始内容：

```bash
#!/bin/bash
# Fix-X 验证脚本（执行过程中由各 Task 填充检查项）
set -e
echo "=== Fix-X 验证 ==="
echo "（待填充）"
```

### 操作

1. `mkdir -p docs/implementation/verification`
2. 创建 4 个脚本
3. `chmod +x docs/implementation/verification/*.sh`

### 验证

```bash
ls docs/implementation/verification/check-fix-*.sh | wc -l
```

输出必须 = 4。

---

## Task 1.1 · 修复论文创新点 #1：schema-explorer 接入置信度门控

### 定位
`apps/server/src/modules/schema-explorer/explore.service.ts`

### 问题
第 3 步「字段语义分析」用 `chineseName !== name` 布尔启发式判定 `pendingFields`，没调用已存在的 `SemanticInferenceService.computeConfidence()` + `CONFIDENCE_THRESHOLD = 0.85`。

### 改什么

**文件**：`apps/server/src/modules/schema-explorer/explore.service.ts`

**1. 确认 `SemanticInferenceService` 已注入**（评审发现 line 53 注入但未使用）

读取 `explore.service.ts`，在 constructor 中确认有：
```typescript
private readonly semanticInference: SemanticInferenceService,
```

**2. 找到判定 pendingFields 的循环**（评审定位在 line 138-148 附近，搜索 `for (const col of table.columns)`）

将原来的启发式：
```typescript
for (const col of table.columns) {
  const hasInference = col.chineseName && col.chineseName !== col.name;
  const isAutoConfirmed = hasInference && col.semanticRole !== "identifier";
  if (!isAutoConfirmed) {
    pendingFields++;
    lowConfFields.push(`${table.name}.${col.name}`);
  }
}
```

改为调用置信度：
```typescript
for (const col of table.columns) {
  // 论文创新点 #1：基于 LLM 置信度门控判定是否需要用户确认
  const confidence = this.semanticInference.computeConfidence(col);
  const isAutoConfirmed = confidence >= 0.85; // CONFIDENCE_THRESHOLD
  if (!isAutoConfirmed) {
    pendingFields++;
    lowConfFields.push(`${table.name}.${col.name} (置信度 ${confidence.toFixed(2)})`);
  }
}
```

**3. 确认 `SemanticInferenceService.computeConfidence` 方法存在**

读取 `apps/server/src/modules/datasource/metadata/semantic-inference.service.ts`，找到 `computeConfidence` 方法（评审定位在 line 239-303）。

如果方法签名是 `computeConfidence(col: ColumnMetadata): number`，直接调用即可。
如果签名不同，调整 Task 1.1 第 2 步的调用方式匹配实际签名。

**4. 删除未使用的注入**（如果 Step 1 确认注入后此处开始使用，则保留；评审说"未使用"是因为没调用，本 Task 修复后就开始使用了）

### 验证

```bash
cd apps/server && grep -n "computeConfidence" src/modules/schema-explorer/explore.service.ts
```

输出必须包含 `this.semanticInference.computeConfidence(col)`。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出必须为空。

### 更新验证脚本

在 `docs/implementation/verification/check-fix-1.sh` 的 `echo "（待填充）"` 后追加：

```bash
echo "[Task 1.1] 检查 schema-explorer 置信度门控..."
cd apps/server
grep -q "computeConfidence" src/modules/schema-explorer/explore.service.ts || { echo "✗ FAIL: 未接入 computeConfidence"; exit 1; }
echo "  ✓ 置信度门控已接入"
```

---

## Task 1.2 · 修复论文创新点 #2：schema-review 越权漏洞

### 定位
`apps/server/src/modules/schema-review/review.controller.ts`

### 问题
`chat` 和 `finalize` 端点（评审定位 line 59-129, 131-136）不接收 `@CurrentUser`，service 也未校验 review 归属。任何登录用户拿到 reviewId 即可操作别人的 review。

### 改什么

**文件**：`apps/server/src/modules/schema-review/review.controller.ts`

**1. 找到 `chat` 端点**（搜索 `@Sse('chat')` 或 `chat(` 方法）

在参数列表中加入 `@CurrentUser()` 装饰器（如果项目已有此装饰器，搜索 `auth.decorators.ts` 确认）。

修改前（伪代码）：
```typescript
@Sse('chat')
async chat(@Query('reviewId') reviewId: string, @Query('message') message: string) {
  return this.reviewService.processAnswerStream(reviewId, message);
}
```

修改后：
```typescript
@Sse('chat')
async chat(
  @Query('reviewId') reviewId: string,
  @Query('message') message: string,
  @CurrentUser() user: { sub: string },
) {
  return this.reviewService.processAnswerStream(reviewId, message, user.sub);
}
```

**2. 找到 `finalize` 端点**，同样加 `@CurrentUser`：

```typescript
@Post(':id/finalize')
async finalize(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
  return this.reviewService.finalizeReview(id, user.sub);
}
```

**3. 确认 `@CurrentUser` 装饰器存在**

读取 `apps/server/src/modules/auth/auth.decorators.ts`（评审说 16 行），确认导出了 `CurrentUser` 装饰器。如果不存在，在 `auth.decorators.ts` 中添加：

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

**文件**：`apps/server/src/modules/schema-review/review.service.ts`

**4. 修改 `processAnswerStream` 方法签名**，加 `userId` 参数

```typescript
async *processAnswerStream(reviewId: string, message: string, userId: string): AsyncGenerator<...> {
  // 在方法开头加归属校验
  const review = await this.getReviewOwnedByUser(reviewId, userId);
  // ... 原有逻辑
}
```

**5. 新增 `getReviewOwnedByUser` 方法**：

```typescript
/**
 * 校验 review 归属：review 必须属于该用户 + 关联的 datasource 也属于该用户
 */
private async getReviewOwnedByUser(reviewId: string, userId: string) {
  const review = await this.getReview(reviewId);
  if (!review) throw new NotFoundException('Review not found');
  
  // 通过 datasource 校验归属
  const ds = await this.datasourceService.getByIdForUser(review.datasourceId, userId);
  if (!ds) throw new ForbiddenException('无权访问该 review');
  
  return review;
}
```

**6. 同样修改 `finalizeReview` 方法**，加 `userId` 参数 + 调 `getReviewOwnedByUser`。

### 验证

```bash
cd apps/server && grep -n "CurrentUser" src/modules/schema-review/review.controller.ts
```

输出必须包含 `@CurrentUser()` 在 `chat` 和 `finalize` 两个方法上。

```bash
cd apps/server && grep -n "getReviewOwnedByUser" src/modules/schema-review/review.service.ts
```

输出必须包含方法定义和调用。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

在 `check-fix-1.sh` 追加：

```bash
echo "[Task 1.2] 检查 schema-review 越权修复..."
cd apps/server
grep -q "CurrentUser" src/modules/schema-review/review.controller.ts || { echo "✗ FAIL"; exit 1; }
grep -q "getReviewOwnedByUser" src/modules/schema-review/review.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 越权漏洞已修复"
```

---

## Task 1.3 · 修复论文创新点 #2：schema-review messages 双重编码 bug

### 定位
`apps/server/src/modules/schema-review/review.service.ts`

### 问题
评审定位 line 366, 397：
```typescript
messages: JSON.stringify(messages) as unknown as Record<string, unknown>
```
`SchemaReviewTable.messages` 是 JSON 列，Kysely 会自动序列化。代码先 `JSON.stringify` 再塞进去 → 存的是字符串 `"[\\"...\\"]"`，读取时直接当数组用会失败。

### 改什么

**文件**：`apps/server/src/modules/schema-review/review.service.ts`

**1. 搜索所有 `JSON.stringify(messages)` 出现的位置**

```bash
grep -n "JSON.stringify(messages)" apps/server/src/modules/schema-review/review.service.ts
```

**2. 对每处出现，改为直接传数组**

修改前：
```typescript
await this.db.updateTable('SchemaReview')
  .set({
    messages: JSON.stringify(messages) as unknown as Record<string, unknown>,
  })
```

修改后：
```typescript
await this.db.updateTable('SchemaReview')
  .set({
    messages: messages as unknown as Record<string, unknown>,
  })
```

**3. 搜索读取 messages 的地方**，确认读取时不需要 `JSON.parse`

搜索 `review.messages as unknown as`，确认读取时直接 cast 成数组，不再 parse：
```typescript
const messages = review.messages as unknown as ReviewMessage[];
// 不要再 JSON.parse，因为 Kysely JSON 列已自动反序列化
```

**4. 确认 Kysely 类型定义**

读取 `apps/server/src/core/kysely/types.ts`，找到 `SchemaReviewTable`，确认 `messages` 字段类型是 `Record<string, unknown>` 或 `unknown[]`（JSON 列的标准类型）。

### 验证

```bash
cd apps/server && grep -c "JSON.stringify(messages)" src/modules/schema-review/review.service.ts
```

输出必须 = 0（所有双重编码已消除）。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 1.3] 检查 messages 双重编码修复..."
cd apps/server
COUNT=$(grep -c "JSON.stringify(messages)" src/modules/schema-review/review.service.ts)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有 $COUNT 处双重编码"; exit 1; fi
echo "  ✓ 双重编码已消除"
```

---

## Task 1.4 · 修复论文创新点 #2：持久化用户纠正的 role

### 定位
`apps/server/src/modules/schema-review/review.service.ts`

### 问题
评审定位 line 339-340：`processAnswer` 解析出 `parsed.role` 但只写 `aliases[parsed.fieldName] = parsed.chineseName`，role 被丢弃。下次 `MetadataService.get` 读 columnAliases 时只覆盖 chineseName，用户对 role 的纠正永远不生效。

### 改什么

**文件**：`apps/server/src/modules/schema-review/review.service.ts`

**1. 找到 `processAnswer` 中更新 columnAliases 的代码**（搜索 `aliases[parsed.fieldName]`）

修改前：
```typescript
aliases[parsed.fieldName] = parsed.chineseName;
```

修改后（扩展为对象，同时存 chineseName + role + description）：
```typescript
// 论文创新点 #2：持久化用户对字段语义的完整纠正（不只 chineseName）
aliases[parsed.fieldName] = {
  chineseName: parsed.chineseName,
  role: parsed.role,           // 用户纠正的语义角色
  description: parsed.description, // 用户补充的描述
};
```

**2. 修改 `MetadataService.get` 读取 columnAliases 的逻辑**

读取 `apps/server/src/modules/datasource/metadata/metadata.service.ts`，找到读取 columnAliases 的地方（评审定位 line 87-95）。

修改前（只读 chineseName）：
```typescript
if (aliases[col.name]) {
  col.chineseName = aliases[col.name];
}
```

修改后（兼容旧字符串格式 + 新对象格式）：
```typescript
if (aliases[col.name]) {
  const alias = aliases[col.name];
  if (typeof alias === 'string') {
    // 旧格式：纯字符串 chineseName
    col.chineseName = alias;
  } else if (typeof alias === 'object' && alias !== null) {
    // 新格式：{ chineseName, role, description }
    if (alias.chineseName) col.chineseName = alias.chineseName;
    if (alias.role) col.semanticRole = alias.role;
    if (alias.description) col.description = alias.description;
  }
}
```

### 验证

```bash
cd apps/server && grep -A2 "aliases\[parsed.fieldName\]" src/modules/schema-review/review.service.ts
```

输出必须显示 `chineseName: parsed.chineseName, role: parsed.role` 对象赋值。

```bash
cd apps/server && grep -A8 "if \(aliases\[col.name\]\)" src/modules/datasource/metadata/metadata.service.ts
```

输出必须包含 `typeof alias === 'object'` 分支。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 1.4] 检查 role 持久化..."
cd apps/server
grep -q "role: parsed.role" src/modules/schema-review/review.service.ts || { echo "✗ FAIL"; exit 1; }
grep -q "typeof alias === 'object'" src/modules/datasource/metadata/metadata.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ role 持久化已实现"
```

---

## Task 1.5 · 修复论文创新点 #3：dashboard-generator 持久化 generate 结果

### 定位
`apps/server/src/modules/dashboard-generator/generator.service.ts`

### 问题
评审定位 line 84-105：`generate()` 方法生成 config 后直接 `return config`，不写 DB。导致 `getConfig()` 读 `understanding.dashboard` 永远是 null，端到端流程断裂。

### 改什么

**文件**：`apps/server/src/modules/dashboard-generator/generator.service.ts`

**1. 找到 `generate` 方法的 return 语句**（搜索 `return config;`）

在 return 前加持久化逻辑：

```typescript
// 论文创新点 #3：持久化生成的 dashboard 配置到 DataSource.schemaUnderstanding.dashboard
const updated = await this.db
  .updateTable('DataSource')
  .set({
    schemaUnderstanding: this.db.fn('jsonb_set', [
      'schemaUnderstanding',
      '"dashboard"',
      this.db.fn('to_jsonb', [JSON.stringify(config)]),
    ]) as any,
  })
  .where('id', '=', datasourceId)
  .returning('id')
  .executeTakeFirst();

return config;
```

**注意**：如果 Kysely 的 `jsonb_set` 写法太复杂，改用更简单的方式——先读后写：

```typescript
// 简化版持久化：先读 schemaUnderstanding，合并 dashboard，再写回
const ds = await this.datasourceService.getByIdForUser(datasourceId, userId);
const understanding = (ds.schemaUnderstanding as Record<string, unknown>) || {};
understanding.dashboard = config;

await this.db
  .updateTable('DataSource')
  .set({ schemaUnderstanding: understanding as any })
  .where('id', '=', datasourceId)
  .execute();
```

推荐用简化版，避免 jsonb_set 的复杂语法。

**2. 确认 `getConfig` 方法能读到**

找到 `getConfig` 方法（评审定位在 line 76-78 附近），确认它读 `understanding.dashboard`：

```typescript
async getConfig(datasourceId: string, userId: string) {
  const record = await this.datasourceService.getByIdForUser(datasourceId, userId);
  if (!record) throw new NotFoundException('DataSource not found');
  const understanding = record.schemaUnderstanding as Record<string, unknown> | null;
  if (!understanding) return null;
  const dashboard = understanding.dashboard;
  return dashboard ?? null;
}
```

### 验证

```bash
cd apps/server && grep -A5 "understanding.dashboard = config" src/modules/dashboard-generator/generator.service.ts
```

输出必须显示持久化逻辑。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 1.5] 检查 dashboard 持久化..."
cd apps/server
grep -q "understanding.dashboard = config" src/modules/dashboard-generator/generator.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ dashboard 持久化已实现"
```

---

## Task 1.6 · 修复论文创新点 #4：insights 接入 InsightAgent

### 定位
`apps/server/src/modules/insights/insight-scheduler.service.ts`

### 问题
评审定位 line 131-133：注释说"LLM 语义分析"，实际跳过 LLM 直接存 anomaly 结果。`InsightAgent` 已注入（line 43）但从未调用。

### 改什么

**文件**：`apps/server/src/modules/insights/insight-scheduler.service.ts`

**1. 找到 `runForDataSource` 方法中"LLM 语义分析"注释处**（搜索 `LLM 语义分析` 或 `persistInsight`）

修改前（line 130-133 附近）：
```typescript
// 3. LLM 语义分析 (生成洞察摘要)
for (const result of log.results.slice(0, 3)) {
  await this.persistInsight(datasourceId, result);
}
```

修改后：
```typescript
// 论文创新点 #4：LLM 语义分析 —— 用 InsightAgent 生成结构化洞察
for (const result of log.results.slice(0, 3)) {
  try {
    const llmInsight = await this.insightAgent.generate({
      question: `${result.table}.${result.field} 异常检测`,
      data: { 
        anomaly: result,
        series: result.evidence?.series,
      },
      focus: 'anomaly',
    });
    
    // 合并 LLM 输出与统计检测结果
    await this.persistInsight(datasourceId, {
      ...result,
      title: llmInsight.summary || result.description,
      description: llmInsight.insights?.[0]?.detail || result.description,
      suggestion: llmInsight.recommendation || result.suggestion,
    });
  } catch (err) {
    this.logger.warn(`LLM 洞察生成失败，降级用统计结果: ${err}`);
    await this.persistInsight(datasourceId, result);
  }
}
```

**2. 确认 `InsightAgent.generate` 方法签名**

读取 `apps/server/src/modules/ai/agents/insight.agent.ts`，确认 `generate` 方法的参数类型（评审说 line 38-73 有完整 prompt + Zod schema）。

如果签名是 `generate(input: { question: string; data: any; focus?: string })`，直接如上调用。
如果签名不同，调整调用参数匹配实际。

### 验证

```bash
cd apps/server && grep -n "insightAgent.generate" src/modules/insights/insight-scheduler.service.ts
```

输出必须包含 `this.insightAgent.generate(` 调用。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 1.6] 检查 InsightAgent 接入..."
cd apps/server
grep -q "insightAgent.generate" src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ InsightAgent 已接入"
```

---

## Task 1.7 · 修复论文创新点 #4：insights 用真实 SQL 替代假数据

### 定位
`apps/server/src/modules/insights/insight-scheduler.service.ts`

### 问题
评审定位 line 149-170：`fetchSampleMetrics` 返回硬编码假数据 `[100, 110, 105, 108, 115, 90, 75 + i * 10]`，注释承认"生产环境应从外部数据源拉取"。

### 改什么

**文件**：`apps/server/src/modules/insights/insight-scheduler.service.ts`

**1. 找到 `fetchSampleMetrics` 方法**

修改前（返回硬编码）：
```typescript
private async fetchSampleMetrics(dsId: string): Promise<MetricSeries[]> {
  // TODO: 生产环境应从外部数据源拉取时序数据
  return kpis.slice(0, 3).map((k, i) => ({
    name: k.metric,
    values: [100, 110, 105, 108, 115, 90, 75 + i * 10],
  }));
}
```

修改后（真实查询）：
```typescript
/**
 * 论文创新点 #4：从数据源拉取真实时序数据用于异常检测
 * 通过 ExecutorFactory 创建 executor，对 dashboard.kpis 中的 metric 跑时序聚合
 */
private async fetchSampleMetrics(dsId: string): Promise<MetricSeries[]> {
  const ds = await this.datasourceService.getByIdForUser(dsId, '');
  if (!ds) return [];

  const understanding = ds.schemaUnderstanding as any;
  if (!understanding?.dashboard?.kpis) return [];

  const config = this.datasourceService.decryptConfigForExecutor(ds);
  const executor = this.executorFactory.create(ds.type, config);

  const series: MetricSeries[] = [];
  for (const kpi of understanding.dashboard.kpis.slice(0, 5)) {
    try {
      // 查询最近 30 天的时序聚合
      const timeField = this.findTimeField(understanding, kpi.table);
      if (!timeField) continue;

      const sql = `SELECT date_trunc('day', "${timeField}") as time, ${kpi.metric} as value
                   FROM "${kpi.table}"
                   WHERE "${timeField}" >= NOW() - INTERVAL '30 days'
                   GROUP BY time
                   ORDER BY time`;
      
      const rows = await executor.executeRaw(sql);
      series.push({
        name: kpi.label,
        values: rows.map((r: any) => parseFloat(r.value) || 0),
      });
    } catch (err) {
      this.logger.warn(`查询 ${kpi.table}.${kpi.metric} 失败: ${err}`);
    }
  }

  await executor.dispose?.();
  return series;
}

/**
 * 从 schema understanding 中找到指定表的时间字段
 */
private findTimeField(understanding: any, tableName: string): string | null {
  const table = understanding.tables?.find((t: any) => t.name === tableName);
  if (!table) return null;
  const timeField = table.fields?.find((f: any) => f.role === 'time');
  return timeField?.field || timeField?.name || null;
}
```

**2. 注入所需依赖**

在 constructor 中确认注入了：
- `DatasourceService`（已有）
- `ExecutorFactory`（需确认是否已注入，如果没有则添加）

读取 `apps/server/src/modules/insights/insight.module.ts`，确认 imports 中有 `DatasourceModule`（ExecutorFactory 从 DatasourceModule 导出）。

**3. 添加 `ExecutorFactory` import**

在文件顶部添加：
```typescript
import { ExecutorFactory } from '../datasource/executors/executor.factory';
```

在 constructor 中添加注入：
```typescript
constructor(
  // ... 已有注入
  private readonly executorFactory: ExecutorFactory,
) { ... }
```

### 验证

```bash
cd apps/server && grep -c "100, 110, 105, 108, 115, 90, 75" src/modules/insights/insight-scheduler.service.ts
```

输出必须 = 0（硬编码假数据已消除）。

```bash
cd apps/server && grep -n "executor.executeRaw" src/modules/insights/insight-scheduler.service.ts
```

输出必须包含真实 SQL 执行调用。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 1.7] 检查真实数据查询..."
cd apps/server
COUNT=$(grep -c "100, 110, 105" src/modules/insights/insight-scheduler.service.ts)
if [ "$COUNT" -ne 0 ]; then echo "✗ FAIL: 仍有硬编码假数据"; exit 1; fi
grep -q "executor.executeRaw" src/modules/insights/insight-scheduler.service.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ 真实数据查询已实现"
```

---

## Task 1.8 · 修复论文创新点 #4：insights controller 加 ownership 过滤

### 定位
`apps/server/src/modules/insights/insight.controller.ts`

### 问题
评审定位 line 46-102：`list/get/dismiss/shield` 接收 `@CurrentUser` 但完全没用 `user.sub` 过滤。任何 `VIEW_INSIGHTS` 权限用户可看/操作所有用户的 Insight。

### 改什么

**文件**：`apps/server/src/modules/insights/insight.controller.ts`

**1. 找到 `list` 方法**，加 userId 过滤

修改前：
```typescript
@Get()
@Permissions(PERMISSIONS.VIEW_INSIGHTS)
async list(@Query('datasourceId') datasourceId: string) {
  return this.insightService.listByDatasource(datasourceId);
}
```

修改后：
```typescript
@Get()
@Permissions(PERMISSIONS.VIEW_INSIGHTS)
async list(
  @Query('datasourceId') datasourceId: string,
  @CurrentUser() user: { sub: string },
) {
  // 校验数据源归属
  await this.datasourceService.getByIdForUser(datasourceId, user.sub);
  return this.insightService.listByDatasource(datasourceId);
}
```

**2. 对 `dismiss` 和 `shield` 方法，先查 insight 的 datasourceId，再校验归属**

```typescript
@Post(':id/dismiss')
@Permissions(PERMISSIONS.VIEW_INSIGHTS)
async dismiss(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
  const insight = await this.insightService.getById(id);
  if (!insight) throw new NotFoundException();
  // 校验该 insight 所属 datasource 归属当前用户
  await this.datasourceService.getByIdForUser(insight.datasourceId, user.sub);
  return this.insightService.dismiss(id);
}
```

**3. 确认 `InsightService` 有 `getById` 方法**，如果没有则添加。

**4. 注入 `DatasourceService`**

在 `InsightController` 的 constructor 中添加 `DatasourceService` 注入，并在 `insight.module.ts` 的 imports 中添加 `DatasourceModule`。

### 验证

```bash
cd apps/server && grep -n "getByIdForUser" src/modules/insights/insight.controller.ts
```

输出必须包含 list/dismiss/shield 方法中的归属校验。

```bash
cd apps/server && pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -5
```

输出为空。

### 更新验证脚本

```bash
echo "[Task 1.8] 检查 insights ownership 过滤..."
cd apps/server
grep -q "getByIdForUser" src/modules/insights/insight.controller.ts || { echo "✗ FAIL"; exit 1; }
echo "  ✓ ownership 过滤已实现"
```

---

## Task 1.9 · Fix-1 最终验证

### 操作

运行完整的 Fix-1 验证脚本 + lint + build：

```bash
bash docs/implementation/verification/check-fix-1.sh
cd apps/server && pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

### 完善 check-fix-1.sh

在脚本末尾追加：

```bash
echo ""
echo "[最终检查] TS 编译 + lint..."
cd apps/server && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: server TS"; exit 1; }
cd ../../apps/web && pnpm exec tsc --noEmit > /dev/null 2>&1 || { echo "✗ FAIL: web TS"; exit 1; }
cd ../..
pnpm lint > /dev/null 2>&1 || { echo "✗ FAIL: lint"; exit 1; }
echo "  ✓ 全量编译通过"

echo ""
echo "====================================="
echo "✓ Fix-1 验证全部通过"
echo "====================================="
```

### 验证

```bash
bash docs/implementation/verification/check-fix-1.sh
```

输出必须以 `✓ Fix-1 验证全部通过` 结尾。

---

## Fix-1 完成标准

✅ Task 1.1: schema-explorer 接入 `computeConfidence` + 0.85 阈值
✅ Task 1.2: schema-review chat/finalize 加 `@CurrentUser` + ownership 校验
✅ Task 1.3: schema-review messages 双重编码消除
✅ Task 1.4: schema-review 持久化用户纠正的 role + description
✅ Task 1.5: dashboard-generator `generate` 末尾持久化 config
✅ Task 1.6: insights scheduler 接入 `InsightAgent.generate`
✅ Task 1.7: insights `fetchSampleMetrics` 用真实 SQL 替代假数据
✅ Task 1.8: insights controller list/dismiss/shield 加 ownership 过滤

**禁止**：未通过 Fix-1 验证就进入 Fix-2。
