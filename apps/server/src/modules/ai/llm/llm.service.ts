import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

/**
 * Options for {@link LlmService.invoke}.
 */
export interface LlmInvokeOptions {
  /** System prompt — sets the model's role/instructions. */
  system?: string;
  /** Human prompt — the user's request. */
  human: string;
  /** Soft timeout in ms (default 60s). The Ollama client is sync-awaitable, so we race it. */
  timeoutMs?: number;
  /** Sampling temperature. Default 0 = deterministic. */
  temperature?: number;
}

/**
 * Options for {@link LlmService.invokeStructured}.
 *
 * The schema is forwarded to the model as JSON instructions, then we
 * parse + Zod-validate the response. We intentionally do NOT use
 * `withStructuredOutput` because Ollama's tool-call support is flaky
 * across versions and we already pay for one round-trip either way.
 */
export interface LlmStructuredOptions<T extends z.ZodTypeAny> {
  system?: string;
  human: string;
  /** Zod schema describing the expected JSON shape. */
  schema: T;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * LlmService — thin wrapper around LangChain's ChatOllama.
 *
 * Why a service instead of newing ChatOllama inline:
 *   1. Single config source (OLLAMA_BASE_URL / OLLAMA_MODEL).
 *   2. One ChatOllama instance per process — avoids repeated model loads.
 *   3. Centralized timeout/retry/logging — every agent stays dumb.
 *
 * All agents MUST go through this service. If the model is unreachable,
 * callers should catch the error and fall back to their template logic.
 */
@Injectable()
export class LlmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LlmService.name);
  private chat: ChatOllama | null = null;
  private baseUrl = '';
  private modelName = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.baseUrl =
      this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    this.modelName =
      this.config.get<string>('OLLAMA_MODEL') ?? 'qwen3:8b';
    this.logger.log(
      `LlmService configured: baseUrl=${this.baseUrl}, model=${this.modelName}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    // ChatOllama holds no native handles that need teardown, but reset
    // the reference so a hot-reload picks up a fresh instance cleanly.
    this.chat = null;
  }

  /**
   * Lazily build the ChatOllama client. We delay construction so that
   * missing env vars or Ollama being down don't crash NestJS bootstrap —
   * the first call surfaces the error, and the caller can fall back.
   */
  private getChat(): ChatOllama {
    if (!this.chat) {
      this.chat = new ChatOllama({
        baseUrl: this.baseUrl,
        model: this.modelName,
        // Conservative defaults. The Qwen models we target (qwen3:8b /
        // qwen2.5:3b) respond well to low temperature for structured work.
        temperature: 0,
        // The Ollama HTTP client doesn't expose per-request timeout in
        // every version, so we race the Promise below.
        numCtx: 4096,
      });
    }
    return this.chat;
  }

  /**
   * Plain text completion. Returns the trimmed content string, or throws
   * on transport / timeout error so the caller can fall back.
   */
  async invoke(opts: LlmInvokeOptions): Promise<string> {
    const messages = this.buildMessages(opts.system, opts.human);
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const chat = this.getChat();

    if (opts.temperature !== undefined) {
      // ChatOllama exposes `temperature` as a mutable field — patching it
      // is cheaper than rebuilding the client per call.
      chat.temperature = opts.temperature;
    }

    const result = await this.raceWithTimeout(
      chat.invoke(messages),
      timeoutMs,
    );

    return this.normalizeContent(result.content);
  }

  /**
   * Structured completion — instructs the model to return JSON, parses
   * the result, then validates with the supplied Zod schema.
   *
   * On parse/validation failure we throw so the agent can fall back.
   */
  async invokeStructured<T extends z.ZodTypeAny>(
    opts: LlmStructuredOptions<T>,
  ): Promise<z.infer<T>> {
    const schemaDescription = this.describeSchema(opts.schema);
    const systemWithSchema = opts.schema
      ? `${opts.system ?? ''}\n\n${schemaDescription}`
      : opts.system;

    const raw = await this.invoke({
      system: systemWithSchema,
      human: opts.human,
      timeoutMs: opts.timeoutMs,
      temperature: opts.temperature,
    });

    return this.parseAndValidate(raw, opts.schema);
  }

  /**
   * Cheap health check — pings Ollama's /api/tags endpoint. Useful at
   * boot to log a warning (but not fail) when the model is missing.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ----- internals -------------------------------------------------------

  private buildMessages(system?: string, human?: string): BaseMessage[] {
    const messages: BaseMessage[] = [];
    if (system && system.trim().length > 0) {
      messages.push(new SystemMessage(system));
    }
    if (human && human.trim().length > 0) {
      messages.push(new HumanMessage(human));
    }
    if (messages.length === 0) {
      throw new Error('LlmService.invoke requires at least a human prompt');
    }
    return messages;
  }

  private async raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`LLM timeout after ${ms}ms`)),
        ms,
      );
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private normalizeContent(content: unknown): string {
    if (typeof content === 'string') return content.trim();
    // ChatOllama sometimes returns AIMessageChunk arrays — flatten them.
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (
            part &&
            typeof part === 'object' &&
            'text' in part &&
            typeof (part as { text: unknown }).text === 'string'
          ) {
            return (part as { text: string }).text;
          }
          return '';
        })
        .join('')
        .trim();
    }
    return String(content ?? '').trim();
  }

  /**
   * Convert a Zod schema into a JSON-Schema-ish description that we
   * splice into the system prompt. We avoid a hard dependency on
   * `zod-to-json-schema` to keep the dependency surface small.
   */
  private describeSchema(schema: z.ZodTypeAny): string {
    // zod's `toJSONSchema` exists on newer zod; on 3.23 we hand-roll a
    // minimal description. The exact field names matter less than the
    // instruction to "return ONLY this JSON shape".
    const lines: string[] = [
      'Return ONLY valid JSON (no prose, no markdown fence) matching this shape:',
      JSON.stringify(
        this.schemaToExample(schema),
        null,
        2,
      ),
    ];
    return lines.join('\n');
  }

  private schemaToExample(schema: z.ZodTypeAny): unknown {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape as Record<string, z.ZodTypeAny>;
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        obj[key] = this.schemaToExample(value);
      }
      return obj;
    }
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 0;
    if (schema instanceof z.ZodBoolean) return false;
    if (schema instanceof z.ZodEnum) return schema.options[0];
    if (schema instanceof z.ZodArray) return [this.schemaToExample(schema.element)];
    if (schema instanceof z.ZodOptional) {
      return this.schemaToExample(schema.unwrap());
    }
    if (schema instanceof z.ZodNullable) {
      return this.schemaToExample(schema.unwrap());
    }
    if (schema instanceof z.ZodUnion) {
      return this.schemaToExample(schema.options[0]);
    }
    return null;
  }

  /**
   * Parse the raw LLM output as JSON and validate against the schema.
   * We strip ```json fences and surrounding prose — Qwen models often
   * wrap their JSON in markdown even when told not to.
   *
   * For ZodEnum schemas specifically, we also accept plain-word output
   * like `sql` because small models (qwen2.5:3b) ignore the JSON
   * instruction and just spit the intent word. Wrapping the bare word
   * in `{ "intent": "<word>" }` here lets the schema validate it
   * without sending the caller through the fallback path.
   */
  private parseAndValidate<T extends z.ZodTypeAny>(
    raw: string,
    schema: T,
  ): z.infer<T> {
    const json = this.extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      // Plain-word fallback: small models often return just `sql` /
      // `chat` without JSON. Try to coerce against the schema if it
      // looks like a single enum value.
      const coerced = this.coercePlainWord(raw, schema);
      if (coerced !== undefined) return coerced;
      throw new Error(
        `LLM returned non-JSON: ${(err as Error).message}; raw=${raw.slice(0, 200)}`,
      );
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      const coerced = this.coercePlainWord(raw, schema);
      if (coerced !== undefined) return coerced;
      throw new Error(
        `LLM JSON did not match schema: ${result.error.message}; raw=${raw.slice(0, 200)}`,
      );
    }
    return result.data;
  }

  /**
   * If `raw` is a single token that matches a ZodEnum value, wrap it
   * so the schema can validate. Handles two shapes:
   *   1. The schema itself is a ZodEnum → return the bare token.
   *   2. The schema is a ZodObject with exactly one field that is a
   *      ZodEnum → return `{ [field]: token }`.
   *
   * Only acts on outputs that look like plain words (no JSON braces).
   * The point is to keep the small 3B model's `sql` / `chat` answers
   * usable without sending the caller through the fallback path.
   */
  private coercePlainWord<T extends z.ZodTypeAny>(
    raw: string,
    schema: T,
  ): z.infer<T> | undefined {
    if (/[{}\[\]"]/.test(raw)) return undefined;

    const trimmed = raw.trim().replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
    const tokens = trimmed
      .split(/[\s,;:]+/)
      .map((t) => t.toLowerCase())
      .filter(Boolean);
    if (tokens.length === 0) return undefined;

    if (schema instanceof z.ZodEnum) {
      return this.firstEnumMatch(tokens, schema.options) as z.infer<T> | undefined;
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape as Record<string, z.ZodTypeAny>;
      const enumFields = Object.entries(shape).filter(
        ([, v]) => v instanceof z.ZodEnum,
      );
      if (enumFields.length !== 1) return undefined;
      const [fieldName, enumSchema] = enumFields[0] as [
        string,
        z.ZodEnum<[string, ...string[]]>,
      ];
      const match = this.firstEnumMatch(tokens, enumSchema.options);
      if (match === undefined) return undefined;
      return { [fieldName]: match } as z.infer<T>;
    }

    return undefined;
  }

  private firstEnumMatch(
    tokens: string[],
    options: readonly [string, ...string[]],
  ): string | undefined {
    for (const tok of tokens) {
      const cleaned = tok.replace(/[^a-z0-9_-]/g, '');
      if ((options as readonly string[]).includes(cleaned)) {
        return cleaned;
      }
    }
    return undefined;
  }

  private extractJson(raw: string): string {
    // Strip ```json ... ``` fences if present.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();

    // Otherwise grab the first {...} block.
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return raw.slice(firstBrace, lastBrace + 1);
    }

    // Or the first [...] block (for top-level arrays).
    const firstBracket = raw.indexOf('[');
    const lastBracket = raw.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return raw.slice(firstBracket, lastBracket + 1);
    }

    return raw.trim();
  }
}