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

### 开发过程文档

| 文档 | 描述 |
|------|------|
| `development/AGENT.md` | Agent 链路开发文档、测试用例 |

## 开发阶段

| Phase | 状态 | 描述 |
|-------|------|------|
| Phase 1 | ✅ | 骨架搭建 - Monorepo、依赖安装、数据库连接 |
| Phase 2 | ✅ | 数据契约定义 - Zod 类型、API 规范 |
| Phase 3 | 🔄 | Agent 链路开发 - 44 个测试用例通过 |
| Phase 4 | ⏳ | SSE 流式输出 |
| Phase 5 | ⏳ | 前端 UI 对接 |
| Phase 6 | ⏳ | Docker 化 |

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

**测试覆盖**:
- RouterAgent: 15 个测试
- SqlAgent: 15 个测试
- ChartAgent: 14 个测试
- **总计**: 44 个测试全部通过 ✅