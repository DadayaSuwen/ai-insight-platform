export { createQuerySalesTool, type QuerySalesTool } from './query-sales.tool';
export { createGenChartTool, type GenChartTool } from './gen-chart.tool';
export { createGenAnalysisTool, type GenAnalysisTool } from './gen-analysis.tool';
export { createSmallTalkTool, type SmallTalkTool } from './small-talk.tool';

/** Plain tool object shape accepted by ChatOllama.bindTools() */
export interface PlannerTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _call(input: any): Promise<string>;
}
