/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatAnthropic } from "@langchain/anthropic";
import { LLMProvider, type LLMConfig } from "@workspace/types";
import { ThinkingChatOllama } from "./thinking-chat-ollama";
import { ThinkingChatOpenAI } from "./thinking-chat-openai";
import { resolveThinkingEnabled } from "./thinking-detection";

/**
 * Factory — creates the appropriate LangChain chat model from a runtime config.
 * All Agent code calls LlmService.invoke() / invokeStructured() and is unaware
 * of which provider is active.
 */
export function createChatModel(config: LLMConfig) {
  // ★ thinking 自动检测：用户没显式配置时按模型名启发式判断
  const enableThinking = resolveThinkingEnabled(config);

  switch (config.provider) {
    case LLMProvider.OPENAI: {
      // DeepSeek API 走 OpenAI 兼容协议（baseUrl=https://api.deepseek.com/v1）
      // 用 ThinkingChatOpenAI 子类处理 reasoning_content 透传。
      // 普通 OpenAI 模型（gpt-4o 等）关闭 thinking 走原版路径。
      const opts: Record<string, unknown> = {
        modelName: config.model,
        temperature: config.temperature ?? 0,
      };
      if (config.apiKey) opts.apiKey = config.apiKey;
      if (config.baseUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        opts.configuration = { baseURL: config.baseUrl };
      }
      return new ThinkingChatOpenAI({
        ...opts,
        thinking: enableThinking,
      } as any);
    }

    case LLMProvider.ANTHROPIC: {
      const opts: Record<string, unknown> = {
        modelName: config.model,
        temperature: config.temperature ?? 0,
      };
      if (config.apiKey) opts.apiKey = config.apiKey;
      if (config.baseUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (opts as any).anthropicApiUrl = config.baseUrl;
      }
      return new ChatAnthropic(opts);
    }

    case LLMProvider.OLLAMA:
    default: {
      // ★ qwen3 / deepseek-r1 等思考模型需要 reasoning_content 多轮透传，
      // @langchain/ollama@0.2.4 把 thinking 塞进 content 字段，破坏 thinking/content 分离
      // 且不回传 reasoning_content → Qwen3 API 报 400。
      // ThinkingChatOllama 是覆盖 _streamResponseChunks 的子类，把 thinking
      // 写入 additional_kwargs.reasoning_content，并支持反向把
      // AIMessage.additional_kwargs.reasoning_content 写入 Ollama 请求的 thinking 字段。
      return new ThinkingChatOllama({
        baseUrl: config.baseUrl || "http://localhost:11434",
        model: config.model,
        temperature: config.temperature ?? 0,
        thinking: enableThinking,
      });
    }
  }
}
