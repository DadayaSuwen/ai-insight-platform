/* eslint-disable @typescript-eslint/no-explicit-any */
import { LLMProvider, type LLMConfig } from "@workspace/types";

/**
 * 是否启用 thinking 模式（Ollama / OpenAI 兼容协议）。
 *
 * 1. 显式设置（config.thinking !== undefined）→ 优先使用
 * 2. 自动检测：模型名匹配思考模型清单时开启
 * 3. OpenAI provider + baseUrl 含 deepseek → DeepSeek API（强制开启）
 *
 * 强制非思考模型名单（即使模型名带 qwen3 字样也不开）：
 *  - qwen2.5 / qwen2.5-coder / llama / codellama / mistral / gemma 等
 */
export function shouldEnableThinking(
  model: string,
  providerOrBaseUrl?: LLMProvider | string,
): boolean {
  const m = model.toLowerCase();

  // 强制非思考模型
  if (/qwen2\.?5/.test(m)) return false;
  if (/llama|codellama|mistral|gemma/.test(m)) return false;

  // 思考模型
  if (/qwen3|qwq|deepseek-r1/.test(m)) return true;
  if (/^o1|^o3|reasoning/.test(m)) return true;

  // DeepSeek API（OpenAI 兼容协议）：model 或 baseUrl 含 deepseek
  if (
    typeof providerOrBaseUrl === "string"
      ? providerOrBaseUrl.toLowerCase().includes("deepseek")
      : providerOrBaseUrl === LLMProvider.OPENAI && m.startsWith("deepseek")
  ) {
    return true;
  }

  return false;
}

/**
 * factory 用的完整决策函数（考虑显式 thinking 字段）。
 */
export function resolveThinkingEnabled(config: LLMConfig): boolean {
  if (config.thinking !== undefined) return config.thinking;
  if (
    config.provider === LLMProvider.OPENAI &&
    config.baseUrl?.toLowerCase().includes("deepseek")
  ) {
    return true;
  }
  return shouldEnableThinking(config.model, config.provider);
}
