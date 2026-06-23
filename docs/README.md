# 项目文档

## 目录结构

```
docs/
├── architecture/    # 架构设计文档
├── api/            # API 接口文档
├── guides/         # 开发指南
└── development/   # 开发过程文档
```

## 文档清单

### 核心文档

| 文档 | 描述 |
|------|------|
| `../project.md` | 项目技术架构设计 (原始设计文档) |
| `../CLAUDE.md` | 项目快速入门指南 |

### 架构文档

| 文档 | 描述 |
|------|------|
| `architecture/SYSTEM.md` | 系统架构设计、模块划分、技术选型 |

### API 文档

| 文档 | 描述 |
|------|------|
| `api/API.md` | API 接口文档 |
| `api/CONTRACTS.md` | 数据契约定义 (Zod schemas) |

### 开发指南

| 文档 | 描述 |
|------|------|
| `guides/SETUP.md` | 开发环境设置、快速启动 |
| `guides/DEBUG.md` | 调试指南、常见问题解决 |
| `guides/CONFIG.md` | TypeScript 配置说明 |
| `guides/DOCKER.md` | Docker 部署指南、架构、故障排查 |

### 开发过程文档

| 文档 | 描述 |
|------|------|
| `development/AGENT.md` | Agent 链路开发文档、测试用例 |
| `development/ISSUES.md` | Phase 3/4/5/6/7 实际运行发现的问题与根因 (含 LLM 接入、Docker 化踩坑、SQL 摘要增强) |

## 开发阶段

| Phase | 状态 | 描述 |
|-------|------|------|
| Phase 1 | ✅ | 骨架搭建 - Monorepo、依赖安装、数据库连接 |
| Phase 2 | ✅ | 数据契约定义 - Zod 类型、API 规范 |
| Phase 3 | ✅ | Agent 链路开发 - 51 个测试用例通过 (含 AiService 编排) |
| Phase 4 | ✅ | SSE 流式输出 - 58 个测试用例通过 (含 ChatService 流) |
| Phase 5 | ✅ | 前端 UI 对接 - 4 个组件完整实现 (MessageBubble/ChatInput/DynamicChart/ChatWindow) |
| **LLM 接入** (#11) | ✅ | **LangChain + Ollama** - LlmService 封装 + 4 个 Agent 接入 + 混合 Router - 80 测试通过 |
| Phase 6 | ✅ | Docker 化 - 4 服务编排 (postgres+ollama+server+web) + 多阶段镜像 + nginx 反代 + entrypoint 自动 init |
| Phase 7 | ✅ | 企业级 UI + SQL 结果增强 - 流式光标/快捷指令/深浅主题/LLM 自然语言摘要/DataTable 表格渲染 |

## 快速链接

- **启动项目**: `pnpm dev:all`
- **运行测试**: `pnpm test`
- **数据库**: `pnpm db:up` + `pnpm db:seed`
- **Prisma Studio**: `pnpm db:studio`

## 测试

```bash
# 运行所有测试
pnpm test

# 运行后端测试
pnpm test:server

# 监听模式
pnpm test:watch

# 覆盖率
pnpm test:coverage
```

**测试覆盖** (LLM 接入后):
- LlmService: 5 个测试 (JSON 解析 / 纯文本兜底)
- RouterAgent: 14 个测试 (含 LLM 路径 + 回退)
- SqlAgent: 14 个测试 (含 LLM + 危险 SQL 拦截)
- ChartAgent: 14 个测试 (含 LLM + 默认补全)
- AnalysisAgent: 5 个测试
- AiService (编排): 8 个测试 (含 LLM mock + chat 回退)
- ChatService (SSE 流): 3 个测试
- **总计**: 80 个测试全部通过 ✅