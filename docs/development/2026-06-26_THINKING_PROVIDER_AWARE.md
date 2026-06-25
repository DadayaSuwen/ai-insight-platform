# 2026-06-26 Thinking 模式按 provider × model 自适应

## 症状（两条独立反馈）

1. **DeepSeek API 报 400**：
   ```
   ERROR [AiService] [stream] PlannerAgent failed: 400 The `reasoning_content` in the thinking mode must be passed back to the API.
   ```
2. **本地 qwen2.5:3b 报不支持 thinking**：
   ```
   "qwen2.5:3b" does not support thinking
   ```

## 根因

上一版（commit `1f2122a`）的 `ThinkingChatOllama` 在 constructor 里**硬编码** `think: true`，导致所有 Ollama 模型（包括 qwen2.5、llama 等非思考模型）都强制开 thinking → Ollama API 拒绝非思考模型。

同时 DeepSeek API（走 OpenAI 兼容协议）也需要 reasoning_content 多轮透传，但 `ChatOpenAI@0.3.11` 的 `_convertMessagesToOpenAIParams` **不读** `additional_kwargs.reasoning_content`，与 Ollama 0.2.4 同源问题。

## 修复

### 1. `ThinkingChatOllama` thinking 可选

- 加 `ThinkingChatOllamaFields.thinking?: boolean` 参数
- 默认 `false`，由 factory 决定何时开启
- `messagesToOllama(messages, enableThinking)` 多一个参数；false 时不写 reasoning_content

### 2. 新建 `ThinkingChatOpenAI` 子类

- 覆盖 `_streamResponseChunks`
- `thinking=true` 时：手工构造 OpenAI 协议消息体（`role, content, reasoning_content, tool_calls`），自己处理流式 chunk（提取 `delta.reasoning_content` → `additional_kwargs.reasoning_content`）
- `thinking=false` 时：走 `super._streamResponseChunks`（与原版 ChatOpenAI 完全一致，不破坏 gpt-4o 等现有路径）

### 3. `LLMConfig` 加 `thinking?: boolean`

- 显式覆盖字段
- 默认 undefined → 自动检测

### 4. `thinking-detection.ts` 自动检测逻辑

```ts
function shouldEnableThinking(model, providerOrBaseUrl): boolean {
  // 强制非思考模型（即使名字带 qwen3 也不开）
  if (/qwen2\.?5/.test(model)) return false;
  if (/llama|codellama|mistral|gemma/.test(model)) return false;

  // 思考模型
  if (/qwen3|qwq|deepseek-r1/.test(model)) return true;
  if (/^o1|^o3|reasoning/.test(model)) return true;

  // DeepSeek API
  if (baseUrl?.includes("deepseek")) return true;

  return false;
}

function resolveThinkingEnabled(config): boolean {
  if (config.thinking !== undefined) return config.thinking;  // 显式优先
  if (config.provider === OPENAI && baseUrl?.includes("deepseek")) return true;
  return shouldEnableThinking(config.model, config.provider);
}
```

### 5. factory 用 `ThinkingChatOpenAI` 替代 `ChatOpenAI`

```ts
case LLMProvider.OPENAI:
  return new ThinkingChatOpenAI({ ...opts, thinking: enableThinking });
```

非 OpenAI provider（Anthropic）继续用原版 ChatAnthropic。

## 模型清单（自动检测结果）

| 模型 | provider | thinking |
|---|---|---|
| `qwen3:8b` | ollama | ✅ ON |
| `qwen3:4b` | ollama | ✅ ON |
| `deepseek-r1:8b` | ollama | ✅ ON |
| `deepseek-reasoner` | openai + DeepSeek baseUrl | ✅ ON |
| `o1-mini` / `o1-preview` | openai | ✅ ON |
| `qwen2.5:3b` | ollama | ❌ OFF |
| `qwen2.5-coder:7b` | ollama | ❌ OFF |
| `llama3.3` | ollama | ❌ OFF |
| `mistral` | ollama | ❌ OFF |
| `gpt-4o` / `gpt-4o-mini` | openai | ❌ OFF |

用户可在 Settings 的 `LLMConfig.thinking` 字段**显式覆盖**自动检测。

## 改动文件

| 文件 | 改动 |
|---|---|
| `packages/types/src/llm.ts` | `LLMConfigSchema` 加 `thinking?: boolean` |
| `apps/server/src/modules/ai/llm/thinking-chat-ollama.ts` | `thinking` 可选 |
| `apps/server/src/modules/ai/llm/thinking-chat-openai.ts` | **新增**：子类处理 OpenAI 兼容协议（DeepSeek） |
| `apps/server/src/modules/ai/llm/thinking-detection.ts` | **新增**：自动检测逻辑 |
| `apps/server/src/modules/ai/llm/llm-factory.ts` | 用 `ThinkingChatOpenAI` + `resolveThinkingEnabled` |
| `apps/server/src/modules/ai/llm/llm.service.ts` | `defaultOllamaChat` 用 `shouldEnableThinking` 自动判断 |

## 验证

| 项 | 结果 |
|---|---|
| `pnpm --filter @workspace/types build` | ✅ |
| `pnpm --filter @ai-insight/server exec tsc --noEmit` | **0 错误** |
| `pnpm --filter @ai-insight/web exec tsc --noEmit` | **0 错误** |

## 风险点

- **OpenAI 子类用 `client.chat.completions.create` 直调**——依赖 OpenAI Node SDK 行为稳定。如果未来升级 SDK 改了 chat 流式接口，需要适配。
- **DeepSeek API 必须用 OpenAI provider + DeepSeek baseUrl 配置**——Settings UI 上要引导用户选 OpenAI provider，填 DeepSeek baseUrl。
- **`LLMConfig.thinking` 字段新增**——DB 老数据没有这个字段，会 fallback 到自动检测；用户可通过 Settings 显式配置。
- **前端 Settings UI 未更新**——目前 web 端发 POST /llm/config 没有 `thinking` 字段，下一轮 UI 改造时加上。
