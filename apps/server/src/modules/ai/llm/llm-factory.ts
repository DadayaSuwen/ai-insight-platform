/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { LLMProvider, type LLMConfig } from '@workspace/types';

/**
 * Factory — creates the appropriate LangChain chat model from a runtime config.
 * All Agent code calls LlmService.invoke() / invokeStructured() and is unaware
 * of which provider is active.
 */
export function createChatModel(config: LLMConfig): any {
  switch (config.provider) {
    case LLMProvider.OPENAI: {
      const opts: Record<string, unknown> = {
        modelName: config.model,
        temperature: config.temperature ?? 0,
      };
      if (config.apiKey) opts.apiKey = config.apiKey;
      if (config.baseUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (opts as any).configuration = { baseURL: config.baseUrl };
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
      return new ChatOllama({
        baseUrl: config.baseUrl || 'http://localhost:11434',
        model: config.model,
        temperature: config.temperature ?? 0,
      });
    }
  }
}
