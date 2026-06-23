# 项目文档

## 目录结构

```
docs/
├── architecture/    # 架构设计文档
├── api/            # API 接口文档
├── guides/         # 开发指南
├── development/    # 开发过程文档
└── archived/       # 过时文档（仅供参考）
```

## 核心文档

| 文档 | 描述 |
|------|------|
| `../CLAUDE.md` | 项目快速入门、技术栈、启动命令 |

## 架构文档

| 文档 | 描述 |
|------|------|
| `architecture/SYSTEM.md` | **Planner + Function Calling** 架构设计、ReAct 循环、工具定义 |

## API 文档

| 文档 | 描述 |
|------|------|
| `api/API.md` | API 接口文档（含 SSE 事件流） |
| `api/CONTRACTS.md` | 数据契约定义 (Zod schemas) |

## 开发指南

| 文档 | 描述 |
|------|------|
| `guides/SETUP.md` | 开发环境设置、快速启动 |
| `guides/DEBUG.md` | 调试指南、常见问题解决 |
| `guides/CONFIG.md` | TypeScript 配置说明 |
| `guides/DOCKER.md` | Docker 部署指南、架构、故障排查 |

## 开发过程文档

| 文档 | 描述 |
|------|------|
| `development/REFACTOR.md` | 架构重构记录：从 RouterAgent → Planner + Function Calling |

## 过时文档（仅供参考）

| 文档 | 描述 |
|------|------|
| `archived/SYSTEM.md` | 旧版 RouterAgent 架构（已废弃） |
| `archived/AGENT.md` | 旧版 Agent 链路文档（已废弃） |
| `archived/ISSUES.md` | Phase 3-9 bug 记录（已归档） |

## 快速链接

- **启动项目**: `pnpm dev:all`
- **运行测试**: `pnpm test`
- **数据库**: `pnpm db:up` + `pnpm db:seed`
- **Prisma Studio**: `pnpm db:studio`
- **Docker 部署**: `pnpm docker:up`（详见 `guides/DOCKER.md`）

## 当前架构

本项目采用 **Planner + Function Calling** 架构：

```
用户输入
    ↓
PlannerAgent.invokeStream()  ← LLM + bindTools([4个工具])
    ↓
LLM 决定调用工具 → 执行 → 结果回灌 → 再次调用 LLM
    ↓
最终文本流式输出
```

**工具**：`query_sales`（查询）、`gen_chart`（图表）、`gen_analysis`（分析）、`small_talk`（闲聊）

详见 [`architecture/SYSTEM.md`](architecture/SYSTEM.md)。
