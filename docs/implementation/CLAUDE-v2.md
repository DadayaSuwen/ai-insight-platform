# AI Insight · Claude Code 修复+重构手册 v2

> **本文件是给 Claude Code 阅读的。基于 sprint-5-7 真实代码评审结果编写。**
>
> **核心变化（vs v1）**：v1 假设从零搭建，v2 假设 sprint-5-7 已完成 70%，只做修复+重构。

---

## 0. 角色与执行规则

### 0.1 你的角色
你是 `ai-insight-platform` 项目 sprint-5-7 分支的修复工程师。项目已有 70% 完成，你的任务是修复 4 个论文创新点的实现缺陷 + 6 个前端静态壳 + 安全漏洞 + 死代码。**你不是架构师，架构已经定好；你是修复者，按手册逐个 Task 做。**

### 0.2 绝对禁止行为

❌ **禁止 1**：禁止重写整个模块（每个 Task 都明确写了改哪个文件的哪几行）
❌ **禁止 2**：禁止删除现有文件（除非 Task 明确说"删除"）
❌ **禁止 3**：禁止引入新依赖（除非 Task 明确列出依赖名+版本）
❌ **禁止 4**：禁止跨 Fix 文件提前做（如 Fix-1 没完成不许碰 Fix-2）
❌ **禁止 5**：禁止用 `any` 类型（现有 `as unknown as` 要逐步消除，但不在本次范围）
❌ **禁止 6**：禁止跳过验证命令
❌ **禁止 7**：禁止修改 `turbo.json` / `pnpm-workspace.yaml` / `prisma/schema.prisma` 的已有模型（只许追加新字段/新模型）
❌ **禁止 8**：禁止动 `apps/server/src/modules/ai/agents/planner.agent.ts` 的 ReAct 循环主逻辑（只许改 Task 指定的行）
❌ **禁止 9**：禁止动 `apps/server/src/modules/datasource/executors/` 下的 3 个 executor 文件（Fix-3 只改 sql-guard）
❌ **禁止 10**：禁止"顺手优化"——不在 Task 范围内的代码即使看到问题也不动

### 0.3 必须遵守的行为

✅ **必须 1**：每个 Task 完成后运行验证命令，输出含 `✓ PASS` 才进下一步
✅ **必须 2**：改动必须精确到行号（手册写了行号，实际行号可能因前序改动偏移，以函数名/代码内容定位）
✅ **必须 3**：新增代码必须有 JSDoc 中文注释
✅ **必须 4**：改 DB schema 必须用 Prisma migration（`prisma migrate dev --name xxx`）
✅ **必须 5**：每个 Fix 文件结束后运行 `pnpm lint && pnpm build`，两者通过
✅ **必须 6**：改动后必须保持 TypeScript strict 模式通过
✅ **必须 7**：遇到手册没覆盖的情况 → 停止，向用户报告

### 0.4 当你不确定时

- 行号偏移 → 用函数名 + 代码内容定位，不要凭行号盲改
- 现有代码与手册描述不符 → 停止，报告差异
- 需要新依赖 → 停止，列依赖名+版本+理由等用户确认
- 验证失败 → 不要改验证脚本，分析失败原因修代码

---

## 1. 项目现状（sprint-5-7 评审结论）

### 1.1 已就绪（禁止改动）

| 模块/文件 | 状态 | 说明 |
|---|---|---|
| `apps/server/src/modules/ai/agents/planner.agent.ts` 主逻辑 | ✅ 8/10 | 动态 Schema + 工具绑定 + ReAct 循环都到位 |
| `apps/server/src/modules/ai/agents/chart.agent.ts` | ✅ 7/10 | LLM 输出隔离设计优秀 |
| `apps/server/src/modules/ai/agents/insight.agent.ts` | ✅ 8/10 | Prompt 工程优秀（但被注入后从未调用，Fix-1 修复） |
| `apps/server/src/modules/datasource/` 5 个子模块 | ✅ 7/10 | executors/metadata/query-gateway/security/upload 架构清晰 |
| `apps/server/src/modules/datasource/security/crypto-box.ts` | ✅ 7/10 | AES-256-GCM 实现正确 |
| `apps/server/src/modules/chat/` | ✅ 8/10 | SSE + 多轮持久化 + 多数据源都到位 |
| `apps/web/src/features/datasources/` | ✅ 9/10 | CSV 两步上传 + LLM 中文别名，全功能 |
| `apps/web/src/features/explore/` | ✅ 9/10 | 真实 SSE 5 步流 |
| `apps/web/src/features/schema-review/SchemaReviewPage.tsx` | ✅ 8/10 | 真实可用 |
| `apps/web/src/features/chat/` | ✅ 8/10 | 真实 ECharts + 多会话 |
| `apps/web/src/features/settings/` | ✅ 9/10 | LLM 配置全功能 |
| `apps/web/src/features/auth/` | ✅ 7/10 | 登录/注册真实可用 |
| Prisma models（User/DataSource/DataSourceSnapshot/SchemaReview/Insight/InviteCode/ChatSession/ChatMessage/LLMConfig） | ✅ | 9 个模型已就绪 |

### 1.2 待修复（本手册覆盖）

| 问题 | 严重度 | 所属 Fix |
|---|---|---|
| 论文创新点 #4（主动洞察）InsightAgent 未调用 + 假数据 | P0 | Fix-1 |
| 论文创新点 #3（自动工作台）generate 不持久化 + 前端假图 | P0 | Fix-1 + Fix-2 |
| 论文创新点 #1（置信度门控）explorer 没调 computeConfidence | P0 | Fix-1 |
| 论文创新点 #2（对话纠错）越权 + messages 双重编码 + role 不持久化 | P0 | Fix-1 |
| 前端 dashboard/insights/admin/history/profile 6 个静态壳 | P0 | Fix-2 |
| RBAC 9/11 权限点未挂载 | P1 | Fix-3 |
| JwtAuthGuard 不查 User.status + 无限流 | P1 | Fix-3 |
| sql-guard 正则可绕过 | P1 | Fix-3 |
| thinking 多轮透传全链路死代码 | P2 | Fix-4 |
| Superstore 残留（metric-labels / chart.agent prompt） | P2 | Fix-4 |
| 3D 图表永远失败 | P2 | Fix-4 |
| 4 个核心模块零单元测试 | P2 | Fix-4 |

---

## 2. 执行顺序（必须严格按序）

| 顺序 | 文件 | 名称 | 估时 | 目标 |
|---|---|---|---|---|
| 1 | `fix-1-thesis-core.md` | 救论文 4 创新点后端 | 3-4 天 | 4 创新点后端 demo-ready |
| 2 | `fix-2-frontend-real.md` | 救前端 6 个静态壳 | 2 天 | 前端真实可用 |
| 3 | `fix-3-security.md` | 安全修复 | 3-4 天 | 准生产级安全 |
| 4 | `fix-4-cleanup-tests.md` | 死代码清理 + 测试 | 2-3 天 | 开源就绪 |

**总计 10-13 个工作日**，覆盖毕业设计答辩 + 上线 + 开源三个目标。

---

## 3. 每个 Task 的执行流程

```
1. 阅读 Task：定位文件 → 改什么 → 验证什么
   ↓
2. 用 Read 工具读目标文件，确认行号/函数名/代码内容
   ↓
3. 用 Edit 工具精确修改（不要用 Write 重写整个文件）
   ↓
4. 运行 Task 末尾的验证命令
   ↓
5. 输出含 ✓ PASS？
   ├─ 是 → 进下一 Task
   └─ 否 → 分析失败 → 修代码 → 回到 4
   ↓ （连续 3 次失败）
6. 停止，向用户报告失败详情
```

---

## 4. 验证脚本说明

每个 Fix 文件末尾有验证脚本，位于 `docs/implementation/verification/check-fix-X.sh`。

**这些脚本由 Fix-0 Task 0 一次性创建**（见 `fix-1-thesis-core.md` Task 1.0）。

---

## 5. 给用户的反馈格式

每完成一个 Fix 文件，输出：

```
✅ Fix-X 完成

修改文件：
- path/to/file.ts (改动说明)
- ...

新增文件：
- path/to/new-file.ts
- ...

验证结果：
- check-fix-X.sh: ✓ PASS
- pnpm lint: ✓ PASS
- pnpm build: ✓ PASS

下一步：Fix-X+1 - <名称>
是否继续？
```

---

## 6. 开始执行

完成本文件阅读后，打开 `docs/implementation/fix-1-thesis-core.md`，从 Task 1.0 开始。

**禁止跳读，禁止跨 Fix 文件。**
