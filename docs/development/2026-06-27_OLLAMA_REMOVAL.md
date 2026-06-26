# 2026-06-27 彻底去 Ollama 化重构

## 动机

用户决定放弃本地 Ollama 推理，全面转向云端 API（OpenAI / Anthropic）。

原架构混合了 Ollama 特殊兼容逻辑（ThinkingChatOllama 子类、`defaultOllamaChat`、`/api/tags` 健康检查、`OLLAMA_BASE_URL` / `OLLAMA_MODEL` 环境变量、Docker Compose ollama service、前端 Settings Ollama 选项卡等），与"标准 LangChain 云端调用"形态严重偏离。

本重构是纯减法：移除所有 Ollama 专属代码，让代码回归标准 OpenAI / Anthropic 调用形态。

> 注：上一轮 commit 中已存在的 `thinking-chat-openai.ts` / `thinking-chat-openai.ts` / `thinking-detection.ts`（用于 DeepSeek API 兼容 + reasoning_content 多轮透传）已随 master 演进被删除，本重构无需处理这些文件。`reasoning_content` 链路若日后需要从 DeepSeek 协议适配，可按需重新引入。

## 删除项

### 后端代码 / 依赖

| 类别 | 文件 / 项 |
|---|---|
| **依赖** | `apps/server/package.json`：`@langchain/ollama@^0.2` |
| **类型** | `packages/types/src/llm.ts`：`LLMProvider.OLLAMA` enum 成员 |
| **后端模块** | `apps/server/src/modules/ai/llm/llm-factory.ts`：`case LLMProvider.OLLAMA` 分支（含 `ChatOllama` import） |
| **后端模块** | `apps/server/src/modules/ai/llm/llm.service.ts`：删除 `defaultOllamaChat()` / `ping()` / `ChatOllama` import / `OLLAMA_BASE_URL` & `OLLAMA_MODEL` 读取 |
| **后端模块** | `apps/server/src/modules/ai/llm/llm.controller.ts`：删除 Ollama `/api/tags` 健康检查子块 + `getModels()` 中的 `ollama` 数组 |
| **后端模块** | `apps/server/src/core/config/config.service.ts`：删除 `OLLAMA_BASE_URL` / `OLLAMA_MODEL` getter |
| **Schema** | `apps/server/prisma/schema.prisma`：`LLMConfig.model` 默认值 `qwen3:8b` → `gpt-4o-mini` |
| **Kysely 类型** | `apps/server/src/core/kysely/types.ts`：`LLMConfigTable.id` 注释去 ollama |

### 前端

| 类别 | 文件 / 项 |
|---|---|
| **状态管理** | `apps/web/src/core/store/index.ts`：`llmHealth.ollama` 字段 / `defaultConfigs[OLLAMA]` / `activeProvider` 默认 `OLLAMA` |
| **设置 UI** | `apps/web/src/features/settings/SettingsPage.tsx`：删 `PROVIDER_LABELS[OLLAMA]` / `DEFAULT_MODELS[OLLAMA]` / `BASE_URLS[OLLAMA]` / Ollama 选项卡 / Ollama 健康状态行 / `form.provider !== OLLAMA` 条件（API Key / Base URL 块改无条件渲染） |

### Docker / 环境变量 / 脚本

| 类别 | 文件 / 项 |
|---|---|
| **Docker Compose** | `docker-compose.yml`：删 ollama service / env `OLLAMA_BASE_URL` / env `OLLAMA_MODEL` / `ollama_data` volume |
| **本地资源** | 删除容器 `ai-ollama`、镜像 `ollama/ollama:latest`、卷 `ai-insight-platform_ollama_data` |
| **环境变量模板** | `.env.example`：删 `# Ollama` 块（`OLLAMA_BASE_URL` / `OLLAMA_MODEL`） |
| **根 package.json** | `docker:infra` script：`docker compose up postgres ollama -d` → `docker compose up postgres -d` |

### 文档

| 类别 | 文件 / 段落 |
|---|---|
| **CLAUDE.md** | Tech Stack / Available Scripts / Environment Variables / Docker 快速启动 |
| **docs/guides/SETUP.md** | 删 "启动 Ollama (LLM 提供方)" 步骤 5（步骤号顺移） |
| **docs/guides/DOCKER.md** | 架构图去 ollama 框 / 端口表去 ollama / env 段去 `OLLAMA_MODEL` / 故障排查去 Ollama 相关 / 删 "切换到云端 API（待办）" 节 |
| **docs/guides/DEBUG.md** | "Ollama 连接失败" → "LLM API 401 / missing key" / "LLM 超时" 通用化 |
| **docs/guides/CONFIG.md** | env 表去 `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / 模型表换云端 / GET /llm/config 示例 / health 示例 |
| **docs/architecture/SYSTEM.md** | 架构图 / 模块注释 / 技术选型表去 Ollama |

## 默认 provider 切换

| 项 | 改前 | 改后 |
|---|---|---|
| `LLMProvider.OPENAI` 默认 | 需手动配置 | **新默认** |
| `LLMProvider.OLLAMA` 默认 | 启动时 fallback | **已删除** |
| `LLMConfig.model` 默认（DB） | `qwen3:8b` | `gpt-4o-mini` |
| `LlmService.initFromDatabase` 默认查询 | `id = OLLAMA` | `id = OPENAI` |
| `LlmService.defaultChat()` 兜底 | `ChatOllama(qwen2.5:3b)` | `createChatModel({ provider: OPENAI, model: 'gpt-4o-mini' })` |
| 前端 store `activeProvider` | `OLLAMA` | `OPENAI` |

## 保留链路

- **OpenAI / Anthropic** 两 provider 全套支持不变（`ChatOpenAI` / `ChatAnthropic`）。
- **OpenAI 兼容端点**（如 DeepSeek）：通过设置 `baseUrl` 即可使用，`ChatOpenAI` 自动走 `configuration.baseURL`。
- **多轮 tool_call 重建**：依然走 Kysely → `ChatMessage` 表 → `buildHistoryMessages` 重建 `BaseMessage[]`。
- **前端 SSE 流**：useSSEChat 处理流程不变。

## 兼容性影响

### 历史数据
若 `LLMConfig` 表已有 `id='ollama'` 行，会变成"无主数据"。修复：
```sql
DELETE FROM "LLMConfig" WHERE id = 'ollama';
```

### 升级路径
1. 拉取本分支
2. 重跑 `pnpm install`（移除 `@langchain/ollama`）
3. 重新构建 Docker 镜像（`pnpm docker:build`）
4. 启动后进入前端 Settings 页面，配置 OpenAI 或 Anthropic API Key
5. 测试 `GET /chat/stream?message=hello&sessionId=<id>` 验证联通

## 验证

| # | 操作 | 预期 |
|---|---|---|
| 1 | `pnpm --filter @workspace/types build` | ✅ 0 错误 |
| 2 | `pnpm --filter @ai-insight/server exec tsc --noEmit` | ✅ **0 错误** |
| 3 | `pnpm --filter @ai-insight/web exec tsc --noEmit` | ✅ **0 错误** |
| 4 | `grep -r "ollama\|Ollama\|OLLAMA" apps/ packages/ docker-compose.yml package.json .env.example 2>/dev/null \| grep -v node_modules` | 仅剩无害残留（如开发日志历史归档） |
| 5 | `grep -r "@langchain/ollama" apps/ packages/ pnpm-lock.yaml 2>/dev/null` | 空 |
| 6 | `docker ps -a \| grep -i ollama` | 空 |
| 7 | `docker images \| grep -i ollama` | 空 |
| 8 | `docker volume ls \| grep -i ollama` | 空 |
| 9 | 启动后端，日志 `LlmService loaded config: provider=openai, model=gpt-4o-mini` | 出现该日志，无 "using env-default Ollama" |
| 10 | 启动前端，Settings 页面只剩 OpenAI / Anthropic 两个选项卡 | 通过 |

## 风险点 & 兜底

- **`LLMProvider` enum 删除 OLLAMA 是破坏性变更**：所有 `switch (config.provider)` 必须有 exhaustive 检查。`llm-factory.ts` 加 `default: never` 守卫，TS 严格模式会在编译期报错提示遗漏 case。
- **首次启动无 API Key**：用户进入前端 Settings 页面配置 key 后刷新会话即可；后端 LlmService 兜底用 OpenAI + gpt-4o-mini，调用时报清晰的 "401 missing API key" 错误。
- **OpenAI 兼容端点**：DeepSeek 等仍可走 `baseUrl` 配置，`ChatOpenAI.configuration.baseURL` 自动生效。

## 分支 & PR

- 分支：`refactor/remove-ollama`
- Commit 数：7
- PR 标题：**"refactor: 彻底去 Ollama 化 — 转向纯云端 API 架构"**