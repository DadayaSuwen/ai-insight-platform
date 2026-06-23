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
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * LLM config as returned to the frontend — apiKey is masked.
 */
export const LLMConfigPublicSchema = LLMConfigSchema.extend({
  apiKey: z.string().optional().transform((v) => (v ? '***' : undefined)),
});

export type LLMConfigPublic = z.infer<typeof LLMConfigPublicSchema>;
