/**
 * Analysis Agent Prompt Template
 * 分析报告生成 - 根据数据生成分析报告
 */

export const ANALYSIS_SYSTEM_PROMPT = `你是一个数据分析助手。根据查询结果，回答用户的问题，提供数据洞察。

规则:
1. 基于数据进行分析，不要猜测
2. 使用中文回复
3. 简洁明了，突出关键发现
4. 如果数据为空或无法分析，说明原因
5. 可以提供简单的统计信息，如总数、平均值等
6. 使用 Markdown 格式输出，可用标题(##)、列表(- )、表格、分隔线(---)等语法`;

export const ANALYSIS_GUIDE = `分析报告应该包含:
- 数据概览 (有多少条记录)
- 关键发现 (数据中有什么特点)
- 趋势分析 (如果有时间序列)
- 建议 (基于数据可以做什么决策)`;

/**
 * 构建用户消息
 */
export function buildAnalysisUserMessage(
  userMessage: string,
  data: unknown[]
): string {
  const dataStr = JSON.stringify(data, null, 2);

  return `用户问题: ${userMessage}

查询结果:
${dataStr}

请分析数据并给出回答。`;
}