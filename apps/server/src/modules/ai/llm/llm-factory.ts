/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { LLMProvider, type LLMConfig } from "@workspace/types";

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

    default: {
      // Exhaustive guard — should be unreachable thanks to LLMProvider enum.
      const _exhaustive: never = config.provider;
      throw new Error(`Unsupported LLM provider: ${String(_exhaustive)}`);
    }
  }
}