import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { LlmService } from './llm.service';
import {
  LLMProvider,
  LLMConfigSchema,
  type LLMConfig,
  type LLMConfigPublic,
} from '@workspace/types';

/**
 * LLM Configuration API.
 *
 * GET  /llm/config  — returns current config (apiKey masked)
 * POST /llm/config  — upserts config + hot-reloads LlmService
 * GET  /llm/health  — pings all 3 providers
 * GET  /llm/models  — returns available models per provider
 */
@Controller('llm')
export class LlmController {
  private readonly logger = new Logger(LlmController.name);

  constructor(private readonly llmService: LlmService) {}

  // ─── GET /llm/config ────────────────────────────────────────────────────────

  @Get('config')
  async getConfig(): Promise<LLMConfigPublic> {
    // Note: LlmService doesn't expose raw config yet; we return a minimal default.
    // Phase 2 will add a getConfig() method to LlmService.
    return {
      provider: LLMProvider.OLLAMA,
      model: 'qwen3:8b',
      temperature: 0,
    };
  }

  // ─── POST /llm/config ────────────────────────────────────────────────────────

  @Post('config')
  @HttpCode(HttpStatus.OK)
  async setConfig(@Body() body: unknown): Promise<{ ok: boolean; message: string }> {
    const parsed = LLMConfigSchema.safeParse(body);
    if (!parsed.success) {
      return {
        ok: false,
        message: `Invalid config: ${parsed.error.message}`,
      };
    }

    const config = parsed.data as LLMConfig;
    await this.llmService.reload(config);
    this.logger.log(`LLM config updated: provider=${config.provider}, model=${config.model}`);
    return { ok: true, message: 'Config updated' };
  }

  // ─── GET /llm/health ────────────────────────────────────────────────────────

  @Get('health')
  async getHealth(): Promise<
    Record<string, { ok: boolean; latencyMs?: number; error?: string }>
  > {
    const result: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

    // Ollama
    try {
      const t0 = Date.now();
      const ok = await this.llmService.ping();
      result['ollama'] = { ok, latencyMs: Date.now() - t0 };
    } catch (e: unknown) {
      result['ollama'] = { ok: false, error: String(e) };
    }

    // OpenAI — requires API key in config, try a cheap /models ping
    try {
      const t0 = Date.now();
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
        signal: AbortSignal.timeout(3000),
      });
      result['openai'] = { ok: res.ok, latencyMs: Date.now() - t0 };
    } catch (e: unknown) {
      result['openai'] = { ok: false, error: String(e) };
    }

    // Anthropic
    try {
      const t0 = Date.now();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-3-5-sonnet-20240620', max_tokens: 1, messages: [] }),
        signal: AbortSignal.timeout(3000),
      });
      // 401 = auth error but the endpoint responds = API is reachable
      result['anthropic'] = { ok: res.ok || res.status === 401, latencyMs: Date.now() - t0 };
    } catch (e: unknown) {
      result['anthropic'] = { ok: false, error: String(e) };
    }

    return result;
  }

  // ─── GET /llm/models ─────────────────────────────────────────────────────────

  @Get('models')
  async getModels(): Promise<Record<string, string[]>> {
    // Return fixed lists for now; Phase 2 would call each provider's /models endpoint
    return {
      openai: [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo',
        'o1-mini', 'o1-preview', 'gpt-4',
      ],
      anthropic: [
        'claude-3-5-sonnet-20240620', 'claude-3-opus-20240229',
        'claude-3-haiku-20240307',
      ],
      ollama: [
        'qwen3:8b', 'qwen3:4b', 'llama3.3', 'mistral',
        'deepseek-r1:8b', 'codellama:13b',
      ],
    };
  }
}
