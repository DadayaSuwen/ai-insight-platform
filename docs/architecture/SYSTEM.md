# 系统架构设计

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Web)                        │
│  React + Vite + Zustand + TailwindCSS + ECharts            │
└─────────────────────┬─────────────────────────────────────┘
                      │ HTTP/SSE
┌─────────────────────▼─────────────────────────────────────┐
│                      Backend (Server)                      │
│  NestJS + Prisma + LangChain                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                   AI Agents                          │ │
│  │  RouterAgent → SqlAgent → ChartAgent → AnalysisAgent │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────┬─────────────────────────────────────┘
                      │ SQL
┌─────────────────────▼─────────────────────────────────────┐
│                   Database                               │
│  PostgreSQL 16                                          │
└─────────────────────────────────────────────────────────────┘
```

## 数据流

1. 用户输入自然语言查询
2. RouterAgent 识别意图 (sql/chart/analysis/chat)
3. SqlAgent 生成 SQL 并执行
4. ChartAgent 生成图表配置
5. AnalysisAgent 生成分析报告
6. 通过 SSE 流式返回给前端

## 模块设计

### 前端模块 (Feature-Based)

- `features/chat` - 聊天功能模块
  - `components/` - 聊天组件
  - `hooks/` - 自定义 Hooks
  - `store/` - 状态管理

### 后端模块 (Module-Based)

- `modules/chat` - 聊天模块
- `modules/database` - 数据库模块
- `modules/ai` - AI 模块
  - `agents/` - AI Agent 实现
  - `prompts/` - Prompt 模板

## 技术选型理由

| 技术 | 选型理由 |
|------|---------|
| pnpm | 性能好，原生支持 Monorepo |
| TypeScript (strict) | 强类型，减少运行时错误 |
| Turborepo | 构建缓存，CI 加速 |
| React 18 | 并发特性 |
| Zustand | 轻量级状态管理 |
| TailwindCSS | 原子化 CSS |
| Shadcn UI | 可定制组件库 |
| ECharts | 强大的图表库 |
| NestJS | 强约束架构 |
| Prisma | 类型安全的 ORM |
| LangChain | AI 编排框架 |
| Ollama | 本地 LLM |
| Zod | 数据校验 |