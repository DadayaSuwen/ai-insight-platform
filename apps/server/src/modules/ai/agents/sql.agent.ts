import { Injectable, Logger } from "@nestjs/common";
import { SQL_SYSTEM_PROMPT, SQL_TABLE_INFO } from "../prompts/sql.prompt";

/**
 * SqlAgent - SQL Generation
 * 根据用户问题生成 SQL 查询
 */
@Injectable()
export class SqlAgent {
  private readonly logger = new Logger(SqlAgent.name);

  /**
   * Generate SQL from user message
   */
  async generate(message: string): Promise<string> {
    this.logger.log(`Generating SQL for: ${message}`);

    try {
      // TODO: Integrate with LangChain + Ollama
      // For now, use simple pattern-based generation

      const sql = this.simpleGenerate(message);
      this.logger.log(`Generated SQL: ${sql}`);

      return sql;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`SQL generation failed: ${message}`);
      // Return safe default query
      return 'SELECT * FROM "Sales" LIMIT 10';
    }
  }

  /**
   * Simple pattern-based SQL generation
   * TODO: Replace with LLM-based generation
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
