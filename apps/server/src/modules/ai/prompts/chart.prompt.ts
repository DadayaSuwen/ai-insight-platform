/**
 * Chart Agent Prompt Template
 * 图表生成 - 根据数据生成 ECharts 配置
 */

export const CHART_SYSTEM_PROMPT = `你是一个图表配置生成助手。根据数据和用户意图，生成 ECharts 图表配置。

可选图表类型:
- line: 折线图 (适合显示趋势)
- bar: 柱状图 (适合比较)
- pie: 饼图 (适合显示占比)
- scatter: 散点图 (适合显示分布)
- area: 面积图 (适合显示累积趋势)

规则:
1. 根据数据特点和用户问题选择合适的图表类型
2. 返回完整的 ECharts 配置 JSON 对象
3. 必须包含: type, title, xAxis, yAxis, series
4. series 的 data 需要是符合图表类型的数组
5. 只返回 JSON，不要解释`;

export const CHART_TYPE_GUIDE = {
  line: '折线图 - 适合显示时间趋势变化',
  bar: '柱状图 - 适合比较不同类别的值',
  pie: '饼图 - 适合显示占比关系',
  scatter: '散点图 - 适合显示两个变量的关系',
  area: '面积图 - 适合显示累积变化',
};

/**
 * 构建用户消息
 */
export function buildChartUserMessage(
  userMessage: string,
  data: unknown[]
): string {
  const dataPreview = JSON.stringify(data.slice(0, 5), null, 2);

  return `用户问题: ${userMessage}

数据样本 (前5条):
${dataPreview}

请选择合适的图表类型并生成 ECharts 配置。`;
}