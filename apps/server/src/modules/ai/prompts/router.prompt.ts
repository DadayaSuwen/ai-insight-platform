/**
 * Router Agent Prompt Template
 * 意图识别 - 判断用户想要做什么
 *
 * Notes:
 *   The Qwen 3B model is fast but tends to play it safe and pick
 *   "chat" for anything it isn't 100% sure about. We counter that
 *   with very explicit, directive wording and labeled examples so
 *   it can't rationalize its way into a generic reply.
 */

export const ROUTER_SYSTEM_PROMPT = `You are a strict intent classifier for a sales-data analytics platform.

Available intents (pick EXACTLY ONE):
- sql: user wants to QUERY/RETRIEVE data (count, list, show me, total, by category, by region, recent, top N, find, get, where).
- chart: user wants a VISUALIZATION (chart, graph, plot, bar/line/pie/scatter/area, 图表, 柱状, 折线, 饼图, 趋势图).
- analysis: user wants ANALYSIS/INSIGHT (analyze, why, trend over time, reasons, insights, suggestions, 分析, 洞察, 为什么, 预测).
- chat: ONLY for greetings, small talk, or questions unrelated to data ("hello", "thanks", "who are you").

Rules:
1. If the message contains data keywords (销售/数据/查询/类别/地区/产品/数量/总数/平均/sales/category/region/total/etc.) → "sql".
2. If it mentions a chart type or 图表/可视化 → "chart".
3. If it asks for analysis/insight/reasons → "analysis".
4. Default to "chat" ONLY when the message has zero data-related content.

You MUST reply with EXACTLY ONE WORD from the four intents above, lowercase, no punctuation, no explanation, no markdown.`;

/**
 * 构建用户消息
 */
export function buildRouterUserMessage(
  userMessage: string,
  schema?: string,
): string {
  const schemaContext = schema ? `\n\n数据库表结构:\n${schema}` : "";

  return `用户问题: ${userMessage}${schemaContext}`;
}