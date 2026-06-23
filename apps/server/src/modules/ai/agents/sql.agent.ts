import { Injectable, Logger } from "@nestjs/common";
import {
  SQL_SYSTEM_PROMPT,
  SQL_TABLE_INFO,
  buildSQLUserMessage,
} from "../prompts/sql.prompt";
import { LlmService } from "../llm/llm.service";

/**
 * Regex matching the first statement up to the closing semicolon.
 * Captures only what looks like a SQL statement; we then hand-validate.
 */
const SQL_STATEMENT_RE = /([\s\S]*?);/i;

/**
 * Words that MUST NOT appear in a generated query. We uppercase both the
 * query and the blacklist before substring matching so casing like
 * "Drop" or "drop" can't sneak through.
 */
const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "VACUUM",
  "REINDEX",
];

/**
 * SqlAgent — SQL Generation
 *
 * Layered strategy:
 *   1. Ask Ollama (qwen3:8b) to produce a single SELECT statement.
 *   2. Extract the SQL from the response (handle ```sql fences, prose).
 *   3. Reject anything that isn't a SELECT — defense in depth, because
 *      a misbehaving model can still emit forbidden DDL.
 *   4. On any failure, fall back to the pattern-based generator so the
 *      pipeline always returns *something* executable.
 */
@Injectable()
export class SqlAgent {
  private readonly logger = new Logger(SqlAgent.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * Generate SQL from user message.
   */
  async generate(message: string): Promise<string> {
    this.logger.log(`Generating SQL for: ${message}`);

    try {
      const raw = await this.llm.invoke({
        system: `${SQL_SYSTEM_PROMPT}\n\n${SQL_TABLE_INFO}`,
        human: buildSQLUserMessage(message),
        timeoutMs: 30_000,
        temperature: 0,
      });
      const sql = this.extractAndValidate(raw);
      this.logger.log(`LLM generated SQL: ${sql}`);
      return sql;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`LLM SQL gen failed (${errMsg}); falling back`);
      return this.simpleGenerate(message);
    }
  }

  /**
   * Strip markdown fences / surrounding prose, then validate the
   * remaining text is a safe SELECT statement.
   */
  private extractAndValidate(raw: string): string {
    const sql = this.stripToSql(raw);
    this.assertSafe(sql);
    return sql;
  }

  private stripToSql(raw: string): string {
    let text = raw.trim();

    // Strip ```sql ... ``` or ``` ... ``` fences.
    const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    if (fenced) {
      text = fenced[1].trim();
    }

    // Take the first ;-terminated statement if present, otherwise the
    // whole text. We pick the first one so models that emit a comment
    // followed by multiple statements can't run more than one.
    const match = text.match(SQL_STATEMENT_RE);
    if (match) {
      text = match[1].trim();
    }

    return text;
  }

  private assertSafe(sql: string): void {
    if (!sql) {
      throw new Error("LLM returned empty SQL");
    }

    const upper = sql.toUpperCase();
    // Reject statements that don't start with SELECT (allow leading comments/whitespace).
    if (!/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*SELECT\b/i.test(sql)) {
      throw new Error(`SQL must start with SELECT, got: ${sql.slice(0, 60)}`);
    }
    for (const kw of FORBIDDEN_KEYWORDS) {
      // Word-boundary check via regex — avoids "UPDATED_AT" matching "UPDATE".
      const re = new RegExp(`\\b${kw}\\b`, "i");
      if (re.test(upper)) {
        throw new Error(`Forbidden keyword ${kw} in SQL: ${sql.slice(0, 60)}`);
      }
    }
    // Postgres folds unquoted identifiers to lowercase, so `FROM Sales`
    // becomes `FROM sales` and breaks against the actual `Sales` table.
    // Require at least one double-quoted identifier in the FROM clause.
    if (!/FROM\s+"[^"]+"/i.test(sql)) {
      throw new Error(`SQL must reference table with double-quoted identifier (e.g. "Sales"): ${sql.slice(0, 80)}`);
    }
  }

  /**
   * Pattern-based SQL generation. Frozen behavior — existing tests
   * assert against these exact strings.
   */
  private simpleGenerate(message: string): string {
    const lowerMessage = message.toLowerCase();

    // Pattern matching for common queries
    if (lowerMessage.includes("销售") || lowerMessage.includes("sales")) {
      if (lowerMessage.includes("类别") || lowerMessage.includes("category")) {
        return 'SELECT "category", SUM("amount") as total FROM "Sales" GROUP BY "category" ORDER BY total DESC LIMIT 10';
      }
      if (lowerMessage.includes("地区") || lowerMessage.includes("region")) {
        return 'SELECT "region", SUM("amount") as total FROM "Sales" GROUP BY "region" ORDER BY total DESC';
      }
      if (
        lowerMessage.includes("时间") ||
        lowerMessage.includes("日期") ||
        lowerMessage.includes("趋势")
      ) {
        return 'SELECT DATE("saleDate") as date, SUM("amount") as total FROM "Sales" GROUP BY DATE("saleDate") ORDER BY date DESC LIMIT 30';
      }
      if (lowerMessage.includes("产品") || lowerMessage.includes("product")) {
        return 'SELECT "productName", "category", "amount", "quantity" FROM "Sales" ORDER BY "amount" DESC LIMIT 10';
      }
      if (
        lowerMessage.includes("总数") ||
        lowerMessage.includes("sum") ||
        lowerMessage.includes("total")
      ) {
        return 'SELECT SUM("amount") as total, SUM("quantity") as quantity FROM "Sales"';
      }
      if (lowerMessage.includes("平均") || lowerMessage.includes("average")) {
        return 'SELECT AVG("amount") as avg_amount FROM "Sales"';
      }
      // Default: return all sales
      return 'SELECT * FROM "Sales" LIMIT 10';
    }

    if (lowerMessage.includes("最近") || lowerMessage.includes("latest")) {
      return 'SELECT * FROM "Sales" ORDER BY "saleDate" DESC LIMIT 10';
    }

    if (
      lowerMessage.includes("top") ||
      lowerMessage.includes("最多") ||
      lowerMessage.includes("highest")
    ) {
      return 'SELECT "productName", SUM("amount") as total FROM "Sales" GROUP BY "productName" ORDER BY total DESC LIMIT 5';
    }

    // Default safe query
    return 'SELECT * FROM "Sales" LIMIT 10';
  }
}