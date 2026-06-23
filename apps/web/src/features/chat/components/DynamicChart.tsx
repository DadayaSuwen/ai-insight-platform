import ReactECharts from 'echarts-for-react';
import type { CSSProperties } from 'react';
import type { SSEChartData } from '@workspace/types';

interface DynamicChartProps {
  chart: SSEChartData;
  style?: CSSProperties;
}

/**
 * DynamicChart — render an SSE chart payload as an ECharts instance.
 *
 * The backend packs the full EChartsOption under `chart.data.option`.
 * We detect the current theme via a CSS class on <html> and pass a
 * matching ECharts theme so colours adapt to dark/light mode.
 */
function DynamicChart({ chart, style }: DynamicChartProps) {
  const option = (chart.data?.['option'] as Record<string, unknown> | undefined) ?? null;
  const isDark = document.documentElement.classList.contains('dark');

  if (!option) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border p-6 text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-primary)' }}
      >
        图表数据为空
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border p-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
    >
      {chart.title && (
        <div
          className="mb-1 px-1 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {chart.title}
        </div>
      )}
      <ReactECharts
        option={option}
        notMerge={true}
        lazyUpdate={true}
        theme={isDark ? 'dark' : 'light'}
        style={{ height: 300, width: '100%', ...style }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}

export default DynamicChart;
