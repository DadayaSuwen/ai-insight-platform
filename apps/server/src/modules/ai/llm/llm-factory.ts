/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import { LLMProvider, type LLMConfig } from "@workspace/types";
import { ThinkingChatOllama } from "./thinking-chat-ollama";

/**
 * Factory — creates the appropriate LangChain chat model from a runtime config.
 * All Agent code calls LlmService.invoke() / invokeStructured() and is unaware
 * of which provider is active.
 */
export function createChatModel(config: LLMConfig) {
  switch (config.provider) {
    case LLMProvider.OPENAI: {
      const opts: Record<string, unknown> = {
        modelName: config.model,
        temperature: config.temperature ?? 0,
      };
      if (config.apiKey) opts.apiKey = config.apiKey;
      if (config.baseUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        opts.configuration = { baseURL: config.baseUrl };
      }
      return new ChatOpenAI(opts);
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
      });
    }
  }
}
