import ReactECharts from 'echarts-for-react';
import type { CSSProperties } from 'react';
import type { SSEChartData } from '@workspace/types';

interface DynamicChartProps {
  chart: SSEChartData;
  style?: CSSProperties;
}

/**
 * DynamicChart - render an SSE chart payload as an ECharts instance.
 *
 * The backend packs the full EChartsOption under `chart.data.option` and
 * the raw rows under `chart.data.rows`; we prefer `option` when available.
 */
function DynamicChart({ chart, style }: DynamicChartProps) {
  const option = (chart.data?.['option'] as Record<string, unknown> | undefined) ?? null;

  if (!option) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500">
        图表数据为空
      </div>
    );
  }

  return (
    <div className="rounded border bg-white p-2">
      {chart.title && (
        <div className="mb-1 text-xs text-gray-500">{chart.title}</div>
      )}
      <ReactECharts
        option={option}
        notMerge={true}
        lazyUpdate={true}
        style={{ height: 280, width: '100%', ...style }}
      />
    </div>
  );
}

export default DynamicChart;
