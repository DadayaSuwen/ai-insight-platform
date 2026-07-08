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
 * GET  /llm/health  — pings all providers
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
    // Distinguish three apiKey shapes from the raw body before zod coercion:
    //   - field absent           → preserve the existing DB key
    //   - field present, ""      → explicit clear (write NULL)
    //   - field present, non-"": → update with that value
    // Without this, every re-save would silently wipe the stored key when the
    // form sends apiKey=undefined (which zod collapses to null in the upsert).
    const rawBody =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};
    const apiKeyInPayload = Object.prototype.hasOwnProperty.call(
      rawBody,
      "apiKey",
    );
    const apiKeyExplicitClear =
      apiKeyInPayload && (rawBody.apiKey === "" || rawBody.apiKey === null);

    await this.llmService.reload(config, {
      preserveApiKey: !apiKeyInPayload,
      explicitClearApiKey: apiKeyExplicitClear,
    });
    this.logger.log(
      `LLM config updated: provider=${config.provider}, model=${config.model}, apiKey=${
        apiKeyExplicitClear
          ? "CLEARED"
          : apiKeyInPayload
            ? "UPDATED"
            : "preserved"
      }`,
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

    // Anthropic — requires API key; if not configured, skip.
    // The probe sends a single-token minimal request (a non-empty messages
    // array) so strict proxies that reject `messages: []` still return
    // a meaningful status code (200 / 401 / 400 / 413) instead of 400-only.
    {
      const cfg = configByProvider[LLMProvider.ANTHROPIC];
      if (!cfg?.apiKey) {
        result["anthropic"] = { ok: false, error: "No API key configured" };
      } else {
        try {
          const t0 = Date.now();
          const rawBase = cfg.baseUrl ?? "https://api.anthropic.com";
          // `new URL(relative, base)` merges trailing slashes correctly,
          // so baseUrl ending in `/v1` doesn't produce `/v1/v1/messages`.
          const baseForUrl = rawBase.endsWith("/") ? rawBase : rawBase + "/";
          const target = new URL("v1/messages", baseForUrl).toString();
          const res = await fetch(target, {
            method: "POST",
            headers: {
              "x-api-key": cfg.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: cfg.model,
              max_tokens: 1,
              messages: [
                { role: "user", content: "ping" },
              ],
            }),
            signal: AbortSignal.timeout(5000),
          });
          // Treat any 2xx as healthy. 401/403 also indicate the endpoint
          // responded (just auth-rejected), so we count them as reachable.
          // 400/413 from strict proxies that don't allow tiny payloads are
          // still endpoint-reachable, just not generating tokens.
          // 5xx and 0 (no response) are real failures.
          let ok = res.ok;
          let error: string | undefined;
          if (!ok) {
            if (res.status === 401 || res.status === 403) {
              ok = true;
            } else if (res.status >= 500) {
              error = `HTTP ${res.status}`;
            } else {
              // 4xx other than auth — reachable but request bad. Surface
              // status so the user understands it's not a connectivity issue.
              ok = true;
              error = `HTTP ${res.status} (endpoint reachable, request bad)`;
            }
          }
          result["anthropic"] = {
            ok,
            error,
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
    };
  }
}
