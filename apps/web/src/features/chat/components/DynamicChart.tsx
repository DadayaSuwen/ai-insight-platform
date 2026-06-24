import ReactECharts from "echarts-for-react";
import type { CSSProperties } from "react";

interface DynamicChartProps {
  option: Record<string, unknown>;
  style?: CSSProperties;
}

/**
 * DynamicChart — 直接接收 EChartsOption 并渲染。
 *
 * 适配新的 Agent 架构，不再需要旧的外层包装结构。
 */
function DynamicChart({ option, style }: DynamicChartProps) {
  const isDark = document.documentElement.classList.contains("dark");

  if (!option || Object.keys(option).length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border p-6 text-sm"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-muted)",
          background: "var(--bg-primary)",
        }}
      >
        图表数据为空
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border p-2"
      style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
    >
      <ReactECharts
        option={option}
        notMerge={true}
        lazyUpdate={true}
        theme={isDark ? "dark" : "light"}
        style={{ height: 300, width: "100%", ...style }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}

export default DynamicChart;
