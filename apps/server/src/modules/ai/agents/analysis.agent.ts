import { Injectable, Logger } from '@nestjs/common';

/**
 * AnalysisAgent - Analysis Report
 * 根据数据和原始问题生成分析报告 (当前为基础实现,后续接入 LLM)
 */
@Injectable()
export class AnalysisAgent {
  private readonly logger = new Logger(AnalysisAgent.name);

  async generate(data: unknown[], message: string): Promise<string> {
    this.logger.log(`Generating analysis for ${data?.length ?? 0} records`);

    if (!data || data.length === 0) {
      return `针对问题"${message}",未查询到相关数据,无法生成分析。`;
    }

    const firstRow = data[0] as Record<string, unknown>;
    const columns = Object.keys(firstRow);

    // 找出可能的数值列
    const numericColumns = columns.filter((col) => {
      const value = firstRow[col];
      return typeof value === 'number';
    });

    let summary = `针对问题"${message}",查询返回 ${data.length} 条记录,包含 ${columns.length} 个字段`;
    if (numericColumns.length > 0) {
      summary += `,其中数值字段为: ${numericColumns.join('、')}`;
    }
    summary += '。';

    // 简单统计: 对第一个数值列求和/平均
    let stats = '';
    if (numericColumns.length > 0) {
      const targetCol = numericColumns[0];
      const values = data
        .map((row) => Number((row as Record<string, unknown>)[targetCol]))
        .filter((v) => !Number.isNaN(v));

      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        stats = `\n\n数值字段 "${targetCol}" 统计:\n- 总和: ${sum.toFixed(2)}\n- 平均: ${avg.toFixed(2)}\n- 最大: ${max}\n- 最小: ${min}`;
      }
    }

    const closing =
      '\n\n注: 当前为基础模板输出,完整 LLM 驱动的深度分析将在后续接入 Ollama 后提供。';

    return summary + stats + closing;
  }
}
