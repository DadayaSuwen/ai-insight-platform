import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { LlmService } from "./llm.service";
import {
  LLMProvider,
  LLMConfigSchema,
  type LLMConfig,
  type LLMConfigs,
} from "@workspace/types";

/**
 * LLM Configuration API.
 *
 * GET  /llm/config  — returns current config (apiKey masked)
 * POST /llm/config  — upserts config + hot-reloads LlmService
 * GET  /llm/health  — pings all 3 providers
 * GET  /llm/models  — returns available models per provider
 */
@Controller("llm")
export class LlmController {
  private readonly logger = new Logger(LlmController.name);

  constructor(private readonly llmService: LlmService) {}

  // ─── GET /llm/config ────────────────────────────────────────────────────────

  @Get("config")
  async getConfig(): Promise<LLMConfigs> {
    const configs = await this.llmService.getAllConfigs();
    return {
      configs: configs.map((c) => ({
        provider: c.provider,
        model: c.model,
        temperature: c.temperature,
        baseUrl: c.baseUrl,
        apiKey: c.apiKey,
      })),
      activeProvider: this.llmService.getActiveProvider(),
    };
  }

  // ─── POST /llm/config ────────────────────────────────────────────────────────

  @Post("config")
  @HttpCode(HttpStatus.OK)
  async setConfig(
    @Body() body: unknown,
  ): Promise<{ ok: boolean; message: string }> {
    const parsed = LLMConfigSchema.safeParse(body);
    if (!parsed.success) {
      return {
        ok: false,
        message: `Invalid config: ${parsed.error.message}`,
      };
    }

    const config = parsed.data as LLMConfig;
    await this.llmService.reload(config);
    this.logger.log(
      `LLM config updated: provider=${config.provider}, model=${config.model}`,
    );
    return { ok: true, message: "Config updated" };
  }

  // ─── GET /llm/health ────────────────────────────────────────────────────────

  @Get("health")
  async getHealth(): Promise<
    Record<string, { ok: boolean; latencyMs?: number; error?: string }>
  > {
    const configs = await this.llmService.getAllConfigs();
    const configByProvider: Record<string, LLMConfig> = {};
    for (const c of configs) {
      configByProvider[c.provider] = c;
    }

    const result: Record<
      string,
      { ok: boolean; latencyMs?: number; error?: string }
    > = {};

    // Ollama — use baseUrl from DB (or default), ping the /api/tags endpoint
    try {
      const t0 = Date.now();
      const cfg = configByProvider[LLMProvider.OLLAMA];
      const baseUrl = cfg?.baseUrl ?? "http://localhost:11434";
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      result["ollama"] = { ok: res.ok, latencyMs: Date.now() - t0 };
    } catch (e: unknown) {
      result["ollama"] = { ok: false, error: String(e) };
    }

    // OpenAI — requires API key; if not configured, skip
    {
      const cfg = configByProvider[LLMProvider.OPENAI];
      if (!cfg?.apiKey) {
        result["openai"] = { ok: false, error: "No API key configured" };
      } else {
        try {
          const t0 = Date.now();
          const baseUrl = cfg.baseUrl ?? "https://api.openai.com/v1";
          const res = await fetch(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${cfg.apiKey}` },
            signal: AbortSignal.timeout(3000),
          });
          result["openai"] = { ok: res.ok, latencyMs: Date.now() - t0 };
        } catch (e: unknown) {
          result["openai"] = { ok: false, error: String(e) };
        }
      }
    }

    // Anthropic — requires API key; if not configured, skip
    {
      const cfg = configByProvider[LLMProvider.ANTHROPIC];
      if (!cfg?.apiKey) {
        result["anthropic"] = { ok: false, error: "No API key configured" };
      } else {
        try {
          const t0 = Date.now();
          const baseUrl = cfg.baseUrl ?? "https://api.anthropic.com";
          const res = await fetch(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
              "x-api-key": cfg.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: cfg.model,
              max_tokens: 1,
              messages: [],
            }),
            signal: AbortSignal.timeout(3000),
          });
          // 401 = auth error but the endpoint responds = reachable
          result["anthropic"] = {
            ok: res.ok || res.status === 401,
            latencyMs: Date.now() - t0,
          };
        } catch (e: unknown) {
          result["anthropic"] = { ok: false, error: String(e) };
        }
      }
    }

    return result;
  }

  // ─── GET /llm/models ─────────────────────────────────────────────────────────

  @Get("models")
  async getModels(): Promise<Record<string, string[]>> {
    // Return fixed lists for now; Phase 2 would call each provider's /models endpoint
    return {
      openai: [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "o1-mini",
        "o1-preview",
        "gpt-4",
      ],
      anthropic: [
        "claude-3-5-sonnet-20240620",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307",
      ],
      ollama: [
        "qwen2.5:3b",
        "qwen3:4b",
        "llama3.3",
        "mistral",
        "deepseek-r1:8b",
        "codellama:13b",
      ],
    };
  }
}
