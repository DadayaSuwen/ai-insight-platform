import { z } from 'zod';

/**
 * Supported LLM providers.
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  OLLAMA = 'ollama',
}

/**
 * LLM configuration — stored in the database and reloadable at runtime.
 */
export const LLMConfigSchema = z.object({
  provider: z.nativeEnum(LLMProvider),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0),
  /**
   * 是否启用 thinking/reasoning 模式。
   *  - undefined → 自动检测（模型名匹配 /qwen3|deepseek-r1|qwq|o1|o3|reasoning/i 时开启）
   *  - true      → 强制开启（适用于 qwen3 / deepseek-r1 / DeepSeek API 等思考模型）
   *  - false     → 强制关闭（适用于 qwen2.5 / gpt-4o 等非思考模型）
   *
   * 开启后：
   *  - Ollama 端点会在请求体顶层加 `think: true`，流式响应里 reading 字段
   *    写入 AIMessage.additional_kwargs.reasoning_content，多轮对话自动回传。
   *  - DeepSeek API（OpenAI 兼容）会读 AIMessage.additional_kwargs.reasoning_content
   *    并在出站请求里写入 reasoning_content 字段。
   */
  thinking: z.boolean().optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * LLM config as returned to the frontend.
 */
export const LLMConfigPublicSchema = LLMConfigSchema;

export type LLMConfigPublic = z.infer<typeof LLMConfigPublicSchema>;

/**
 * Response shape for GET /llm/config — all 3 provider configs at once.
 */
export const LLMConfigsSchema = z.object({
  configs: z.array(LLMConfigPublicSchema),
  activeProvider: z.string(),
});

export type LLMConfigs = z.infer<typeof LLMConfigsSchema>;
