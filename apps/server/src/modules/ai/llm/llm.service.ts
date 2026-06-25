import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { LLMProvider, type LLMConfig } from "@workspace/types";
import { DatabaseService } from "../../database/database.service";
import { createChatModel } from "./llm-factory";

/**
 * Options for {@link LlmService.invoke}.
 */
export interface LlmInvokeOptions {
  /** System prompt — sets the model's role/instructions. */
  system?: string;
  /** Human prompt — the user's request. */
  human: string;
  /** Soft timeout in ms (default 60s). */
  timeoutMs?: number;
  /** Sampling temperature. Default 0 = deterministic. */
  temperature?: number;
}

/**
 * Options for {@link LlmService.invokeStream}.
 */
export interface LlmStreamOptions {
  system?: string;
  human: string;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * Options for {@link LlmService.invokeStructured}.
 */
export interface LlmStructuredOptions<T extends z.ZodTypeAny> {
  system?: string;
  human: string;
  schema: T;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * LlmService — runtime-configurable LLM wrapper.
 *
 * All Agents call invoke() / invokeStructured() and are unaware of the active
 * provider (OpenAI / Anthropic / Ollama).  The active adapter is created by
 * LlmFactory from the config stored in the `LLMConfig` database table.
 *
 * Startup: reads config from LLMConfig table on onModuleInit.
 * Runtime: POST /llm/config calls reload() to hot-reload the adapter.
 */
@Injectable()
export class LlmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LlmService.name);

  /** The currently active LangChain chat model. */
  private chat: ReturnType<typeof createChatModel> | null = null;

  /**
   * Ensures the chat model is initialized before every call.
   * Set by onModuleInit and reload().
   */
  private chatReady: Promise<void>;

  /** The provider currently in use — set on startup and after each reload. */
  private activeProvider: LLMProvider = LLMProvider.OLLAMA;

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {
    this.chatReady = this.initFromDatabase();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.chatReady;
  }

  async onModuleDestroy(): Promise<void> {
    this.chat = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Plain text completion.
   */
  async invoke(opts: LlmInvokeOptions): Promise<string> {
    await this.chatReady;
    const chat = this.getRequiredChat();
    const messages = this.buildMessages(opts.system, opts.human);
    const timeoutMs = opts.timeoutMs ?? 60_000;

    if (opts.temperature !== undefined) {
      chat.temperature = opts.temperature;
    }

    const result = await this.raceWithTimeout(
      chat.invoke(messages as any) as Promise<AIMessage>,
      timeoutMs,
    );
    return this.normalizeContent(result.content);
  }

  /**
   * Streaming text completion — yields tokens as they arrive.
   * Used by SSE streaming to give real-time token-by-token output.
   */
  async *invokeStream(opts: LlmStreamOptions): AsyncGenerator<string> {
    await this.chatReady;
    const chat = this.getRequiredChat();
    const messages = this.buildMessages(opts.system, opts.human);
    const timeoutMs = opts.timeoutMs ?? 120_000;

    if (opts.temperature !== undefined) {
      (chat as unknown as { temperature: number }).temperature =
        opts.temperature;
    }

    // LangChain's stream() may return a Promise that resolves to AsyncIterable
    // (e.g. ChatOpenAI returns Promise<IterableReadableStream>).
    // Wrap sync iterables in an async generator for uniform handling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (chat as any).stream(messages);
    const stream: AsyncIterable<unknown> =
      raw[Symbol.asyncIterator] != null
        ? raw
        : (async function* () {
            yield* raw;
          })();

    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
    }, timeoutMs);

    try {
      // Track accumulated content to detect new chunks
      let accumulated = "";

      for await (const chunk of stream) {
        if (timedOut) {
          throw new Error(`LLM stream timeout after ${timeoutMs}ms`);
        }
        const content = this.normalizeContent(
          (chunk as { content: unknown }).content,
        );
        if (content) {
          accumulated += content;
          yield content;
        }
      }
    } catch (err) {
      this.logger.error(
        `[invokeStream] Stream error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  /**
   * Structured completion — returns Zod-validated JSON.
   */
  async invokeStructured<T extends z.ZodTypeAny>(
    opts: LlmStructuredOptions<T>,
  ): Promise<z.infer<T>> {
    await this.chatReady;
    const schemaDescription = this.describeSchema(opts.schema);
    const systemWithSchema = opts.schema
      ? `${opts.system ?? ""}\n\n${schemaDescription}`
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
   * Ollama-only health check (legacy).
   * Phase 2 will implement multi-provider health.
   */
  async ping(): Promise<boolean> {
    try {
      const baseUrl =
        this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434";
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Hot-reload the chat model.
   * Called by LlmController after a config update.
   * @param config  Optional new config to use instead of reading from DB.
   */
  async reload(config?: LLMConfig): Promise<void> {
    // Persist to DB if provided (called from POST /llm/config)
    if (config) {
      const db = this.database.db;
      const now = new Date();
      await db
        .insertInto("LLMConfig")
        .values({
          id: config.provider,
          apiKey: config.apiKey ?? null,
          baseUrl: config.baseUrl ?? null,
          model: config.model,
          temperature: config.temperature,
          createdAt: now,
          updatedAt: now,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            apiKey: config.apiKey ?? null,
            baseUrl: config.baseUrl ?? null,
            model: config.model,
            temperature: config.temperature,
            updatedAt: now,
          }),
        )
        .execute();
    }
    this.chatReady = config
      ? this.initWithConfig(config)
      : this.initFromDatabase();
    await this.chatReady;
  }

  /**
   * Returns all saved configs for every provider.
   * Used by GET /llm/config to populate the Settings form.
   */
  async getAllConfigs(): Promise<LLMConfig[]> {
    const rows = await this.database.db
      .selectFrom("LLMConfig")
      .selectAll()
      .execute();
    return rows.map((row) => ({
      provider: row.id as LLMProvider,
      apiKey: row.apiKey ?? undefined,
      baseUrl: row.baseUrl ?? undefined,
      model: row.model,
      temperature: row.temperature,
    }));
  }

  /** Returns the provider that is currently active (last loaded from DB or set via reload). */
  getActiveProvider(): LLMProvider {
    return this.activeProvider;
  }

  /**
   * Expose the underlying chat model for tool binding.
   * Used by PlannerAgent to call bindTools() on the active provider.
   */
  getChatModel(): ReturnType<typeof createChatModel> {
    return this.getRequiredChat();
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async initFromDatabase(): Promise<void> {
    this.activeProvider = LLMProvider.OLLAMA;
    try {
      const row = await this.database.db
        .selectFrom("LLMConfig")
        .selectAll()
        .where("id", "=", LLMProvider.OLLAMA)
        .executeTakeFirst();

      if (!row) {
        this.chat = this.defaultOllamaChat();
        this.logger.warn(
          "No LLMConfig in DB; using env-default Ollama. Set config via POST /llm/config",
        );
        return;
      }

      const config: LLMConfig = {
        provider: row.id as LLMProvider, // id IS the provider
        apiKey: row.apiKey ?? undefined,
        baseUrl: row.baseUrl ?? undefined,
        model: row.model,
        temperature: row.temperature,
      };

      this.chat = createChatModel(config);
      this.logger.log(
        `LlmService loaded config: provider=${config.provider}, model=${config.model}`,
      );
    } catch (err) {
      this.logger.error(
        "Failed to init LLM from DB, falling back to Ollama",
        err,
      );
      this.chat = this.defaultOllamaChat();
    }
  }

  private async initWithConfig(config: LLMConfig): Promise<void> {
    this.activeProvider = config.provider;
    try {
      this.chat = createChatModel(config);
      this.logger.log(
        `LlmService reloaded: provider=${config.provider}, model=${config.model}`,
      );
    } catch (err) {
      this.logger.error("Failed to apply new LLM config", err);
      throw err;
    }
  }

  private defaultOllamaChat() {
    return new ChatOllama({
      baseUrl:
        this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434",
      model: this.config.get<string>("OLLAMA_MODEL") ?? "qwen2.5:3b",
      temperature: 0,
      numCtx: 4096,
    });
  }

  private getRequiredChat(): ReturnType<typeof createChatModel> {
    if (!this.chat) {
      throw new Error(
        "LlmService not initialized. Ensure onModuleInit completed.",
      );
    }
    return this.chat;
  }

  private buildMessages(system?: string, human?: string): BaseMessage[] {
    const messages: BaseMessage[] = [];
    if (system?.trim()) messages.push(new SystemMessage(system));
    if (human?.trim()) messages.push(new HumanMessage(human));
    if (messages.length === 0) {
      throw new Error("LlmService.invoke requires at least a human prompt");
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
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (
            part &&
            typeof part === "object" &&
            "text" in part &&
            typeof (part as { text: unknown }).text === "string"
          ) {
            return (part as { text: string }).text;
          }
          return "";
        })
        .join("")
        .trim();
    }
    return String(content ?? "").trim();
  }

  private describeSchema(schema: z.ZodTypeAny): string {
    const lines: string[] = [
      "Return ONLY valid JSON (no prose, no markdown fence) matching this shape:",
      JSON.stringify(this.schemaToExample(schema), null, 2),
    ];
    return lines.join("\n");
  }

  private schemaToExample(schema: z.ZodTypeAny): unknown {
    if (schema instanceof z.ZodObject) {
      const shape = (schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape;
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shape)) {
        obj[key] = this.schemaToExample(value as z.ZodTypeAny);
      }
      return obj;
    }
    if (schema instanceof z.ZodString) return "string";
    if (schema instanceof z.ZodNumber) return 0;
    if (schema instanceof z.ZodBoolean) return false;
    if (schema instanceof z.ZodEnum) return schema.options[0];
    if (schema instanceof z.ZodArray)
      return [
        this.schemaToExample((schema as z.ZodArray<z.ZodTypeAny>).element),
      ];
    if (schema instanceof z.ZodOptional)
      return this.schemaToExample(
        (schema as z.ZodOptional<z.ZodTypeAny>).unwrap(),
      );
    if (schema instanceof z.ZodNullable)
      return this.schemaToExample(
        (schema as z.ZodNullable<z.ZodTypeAny>).unwrap(),
      );
    if (schema instanceof z.ZodUnion) {
      const opts = (schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>)
        .options;
      return this.schemaToExample(opts[0]);
    }
    return null;
  }

  private parseAndValidate<T extends z.ZodTypeAny>(
    raw: string,
    schema: T,
  ): z.infer<T> {
    const json = this.extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
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

  private coercePlainWord<T extends z.ZodTypeAny>(
    raw: string,
    schema: T,
  ): z.infer<T> | undefined {
    if (/[{}\[\]"]/.test(raw)) return undefined;
    const trimmed = raw
      .trim()
      .replace(/^```\w*\s*/, "")
      .replace(/\s*```$/, "");
    const tokens = trimmed
      .split(/[\s,;:]+/)
      .map((t) => t.toLowerCase())
      .filter(Boolean);
    if (tokens.length === 0) return undefined;

    if (schema instanceof z.ZodEnum) {
      return this.firstEnumMatch(
        tokens,
        (schema as z.ZodEnum<[string, ...string[]]>).options,
      ) as z.infer<T> | undefined;
    }

    if (schema instanceof z.ZodObject) {
      const shape = (schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape;
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
      const cleaned = tok.replace(/[^a-z0-9_-]/g, "");
      if ((options as readonly string[]).includes(cleaned)) {
        return cleaned;
      }
    }
    return undefined;
  }

  private extractJson(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return raw.slice(firstBrace, lastBrace + 1);
    }
    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return raw.slice(firstBracket, lastBracket + 1);
    }
    return raw.trim();
  }
}
