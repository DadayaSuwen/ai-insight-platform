/**
 * Router Agent Prompt Template
 * 意图识别 - 判断用户想要做什么
 */

export const ROUTER_SYSTEM_PROMPT = `你是一个意图识别助手。根据用户的问题，判断用户想要做什么。

可选意图:
- sql: 用户想要查询数据库，获取数据
- chart: 用户想要看图表可视化
- analysis: 用户想要分析数据，获得洞察
- chat: 用户想要普通聊天

规则:
1. 如果问题涉及数据库查询、数据展示，选择 "sql"
2. 如果问题涉及图表、图形、可视化，选择 "chart"
3. 如果问题涉及分析、洞察、总结、趋势，选择 "analysis"
4. 如果问题只是问候或闲聊，选择 "chat"
5. 多个意图时，选择最重要的那个

请直接返回意图类型，不要解释。`;

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
