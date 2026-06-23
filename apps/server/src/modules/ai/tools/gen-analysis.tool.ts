import { DatabaseService } from '../../database/database.service';
import { SqlAgent } from '../agents/sql.agent';
import { AnalysisAgent } from '../agents/analysis.agent';

/**
 * gen_analysis tool
 *
 * Generates a narrative analysis report from sales data.
 * Use when the user asks for analysis, insights, reasons,
 * predictions, or suggestions.
 */
export function createGenAnalysisTool(
  db: DatabaseService,
  sqlAgent: SqlAgent,
  analysisAgent: AnalysisAgent,
) {
  return {
    name: 'gen_analysis',
    description:
      '生成深度分析报告。当用户要求分析数据、寻找原因、预测趋势或给出建议时调用。返回分析报告文本+SQL+数据行。',

    async _call(input: Record<string, unknown>): Promise<string> {
      const query = input.query as string;

      // Step 1: Generate SQL
      const sql = await sqlAgent.generate(query);

      // Step 2: Execute query
      const rows = await db.executeQuery(sql);

      // Step 3: Generate analysis
      const analysis = await analysisAgent.generate(rows, query);

      return JSON.stringify({
        sql,
        rows,
        analysis,
        rowCount: rows.length,
      });
    },
  };
}

export type GenAnalysisTool = ReturnType<typeof createGenAnalysisTool>;
