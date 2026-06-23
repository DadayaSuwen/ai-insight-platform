import { DatabaseService } from '../../database/database.service';
import { SqlAgent } from '../agents/sql.agent';
import { ChartAgent, EChartsOption } from '../agents/chart.agent';

/**
 * gen_chart tool
 *
 * Generates an ECharts chart configuration from sales data.
 * Use when the user asks for a chart, graph, visualization,
 * bar/line/pie/scatter chart, or 图表.
 */
export function createGenChartTool(
  db: DatabaseService,
  sqlAgent: SqlAgent,
  chartAgent: ChartAgent,
) {
  return {
    name: 'gen_chart',
    description:
      '生成 ECharts 可视化图表配置。当用户要求生成图表、可视化、柱状图、折线图、饼图时调用。返回图表配置+SQL+数据行。',

    async _call(input: Record<string, unknown>): Promise<string> {
      const query = input.query as string;

      // Step 1: Generate SQL
      const sql = await sqlAgent.generate(query);

      // Step 2: Execute query
      const rows = await db.executeQuery(sql);

      // Step 3: Generate chart config
      const chart: EChartsOption = await chartAgent.generate(rows, query);

      return JSON.stringify({
        sql,
        rows,
        chart,
        chartType: (chart.series?.[0] as { type?: string })?.type ?? 'bar',
        rowCount: rows.length,
      });
    },
  };
}

export type GenChartTool = ReturnType<typeof createGenChartTool>;
