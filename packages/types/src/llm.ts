import { z } from 'zod';

/**
 * Supported LLM providers (cloud only — local Ollama removed 2026-06-27).
 */
export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
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
