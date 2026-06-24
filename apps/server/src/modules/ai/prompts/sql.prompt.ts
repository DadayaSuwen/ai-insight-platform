/**
 * SQL Agent Prompt Template
 * SQL 生成 - 根据用户问题生成 SQL 查询
 */

export const SQL_SYSTEM_PROMPT = `你是一个 SQL 生成助手。根据用户的问题，生成对应的 SQL 查询语句。

数据库表结构:
Sales:
- id: integer (主键)
- productName: text (产品名称)
- category: text (类别)
- amount: numeric (金额)
- quantity: integer (数量)
- region: text (地区)
- saleDate: timestamp (销售日期)

ChatSession:
- id: uuid (主键)
- userId: text (用户ID，可空)
- title: text (会话标题，可空)
- createdAt: timestamp
- updatedAt: timestamp

ChatMessage:
- id: uuid (主键)
- sessionId: uuid (外键，关联 ChatSession)
- role: text (user/assistant/system)
- content: text (消息内容)
- metadata: jsonb (元数据，可空)
- createdAt: timestamp

规则:
1. 只生成 SELECT 查询，不要生成 INSERT/UPDATE/DELETE
2. 使用双引号包裹表名和列名，如 "Sales".productName
3. 使用 PostgreSQL 语法
4. 如果不确定，返回简单的查询，如 SELECT * FROM "Sales" LIMIT 10
5. 只返回 SQL 语句，不要解释`;

export const SQL_TABLE_INFO = `Sales: id, productName, category, amount, quantity, region, saleDate, createdAt, updatedAt
ChatSession: id, userId, title, createdAt, updatedAt
ChatMessage: id, sessionId, role, content, metadata, createdAt`;

/**
 * 构建用户消息
 */
export function buildSQLUserMessage(userMessage: string): string {
  return `用户问题: ${userMessage}\n\n请生成 SQL 查询语句。`;
}

// ─── SQL Summary ──────────────────────────────────────────────────────────────

export const SQL_SUMMARY_SYSTEM_PROMPT = `你是一个数据分析助手。根据查询结果，用 2-4 句话用中文总结关键发现。要求：
- 语言简洁、自然，适合直接展示给用户
- 提及具体数字（金额、数量等）并带上单位
- 突出最大值、最小值、总计等关键统计
- 不要重复"查询成功"这类废话
- 禁止编造数据，只基于提供的 rows 信息`;

export const SQL_SUMMARY_USER_TEMPLATE = `用户原始问题: {question}

查询结果 (共 {count} 条):
{rowsJson}

请用中文总结关键发现（2-4句话）：`;

export function buildSQLSummaryUserMessage(
  question: string,
  rows: unknown[],
): string {
  const count = rows.length;
  const rowsJson = JSON.stringify(rows, null, 2);
  return SQL_SUMMARY_USER_TEMPLATE.replace('{question}', question)
    .replace('{count}', String(count))
    .replace('{rowsJson}', rowsJson);
}