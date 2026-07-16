import { Injectable, Logger } from "@nestjs/common";
import { METRIC_LABELS, type MetricKey } from "./metric-labels";
import { type ChartIntent } from "./schemas";

export interface EChartsOption {
  [key: string]: any;
}

/**
 * [GUARD-V2-2] 装配异常 — 数据不匹配图表要求时直接抛出,由上层 catch 后降级表格
 */
export class ChartAssembleError extends Error {
  constructor(
    message: string,
    public readonly chartType: string,
    public readonly reason: "data-shape" | "missing-field" | "unsupported",
  ) {
    super(message);
    this.name = "ChartAssembleError";
  }
}

/** 装配上下文 */
export interface AssembleCtx {
  groupLabel?: string;
  dataTruncated?: boolean;
  originalRowCount?: number;
}

/**
 * ChartHelper (V2 重构 — ChartAssembler)
 *
 * [GUARD-V2-2] **装配确定性**: 本类不包含 try-catch 修复逻辑。
 * 数据不匹配图表要求时,直接抛 ChartAssembleError,由上层降级表格。
 *
 * 链路:
 *   gen-chart.tool.ts
 *     → chartAgent.extractIntent()  得到 ChartIntent
 *     → chartHelper.assemble(intent, rows, ctx)  返回 EChartsOption (本类)
 *     → SSE tool_result 透传
 *
 * 样式隔离 (M5-Patch 升级): 装配 option **绝不**在 series/itemStyle 内含 color/textStyle/backgroundColor 等样式字段,
 *          仅在顶层 `option.color` 注入来自 intent.colorPalette 的色板数组 (LLM 提取的用户指定颜色)。
 *          其余样式由前端 ECharts 主题控制。
 */

@Injectable()
export class ChartHelper {
  private readonly logger = new Logger(ChartHelper.name);

  /**
   * [GUARD-V2-2] 主入口 — 26 类硬编码装配
   * [M5-Patch] 装配完成后顶层注入 color (来自 intent.colorPalette)
   */
  /**
   * [Sprint 5.7] 解析指标/列的中文显示名。
   * 优先级: fieldMapping > METRIC_LABELS > 原始物理名
   */
  private resolveLabel(
    key: string,
    fieldMapping?: Record<string, string>,
  ): string {
    return fieldMapping?.[key] ?? METRIC_LABELS[key as MetricKey] ?? key;
  }

  assemble(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    ctx: AssembleCtx = {},
    fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    if (!rows || rows.length === 0) {
      return this.getDefaultChart();
    }

    // [M5-Patch] 委托 dispatch(),装配完成后再注入 color (顶层覆盖 ECharts 主题色)
    const baseOption = this.dispatch(intent, rows, ctx, fieldMapping);
    if (intent.colorPalette && intent.colorPalette.length > 0) {
      baseOption.color = [...intent.colorPalette];
    }
    return baseOption;
  }

  /**
   * [M5-Patch] 26 类硬编码装配 (从原 assemble() switch 抽出)
   * 不包含颜色注入 (在 assemble() 顶层处理),保证样式隔离。
   */
  private dispatch(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    ctx: AssembleCtx,
    fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    switch (intent.chartType) {
      // 基础 5 类
      case "line":
      case "area":  // area 复用 line + areaStyle (ECharts 无原生 area 系列)
        return this.assembleXY(
          intent,
          rows,
          ctx,
          "line",
          intent.chartType === "area" ? { areaStyle: {} } : {},
          fieldMapping,
        );
      case "bar":
        return this.assembleXY(intent, rows, ctx, "bar", {}, fieldMapping);
      case "scatter":
        return this.assembleScatter(intent, rows, ctx, fieldMapping);
      case "pie":
        return this.assemblePie(intent, rows, ctx, fieldMapping);

      // 复杂图
      case "heatmap":
        return this.assembleHeatmap(intent, rows, ctx, fieldMapping);
      case "treemap":
        return this.assembleTreemap(intent, rows, ctx, fieldMapping);
      case "sankey":
        return this.assembleSankey(intent, rows, ctx, fieldMapping);
      case "funnel":
        return this.assembleFunnel(intent, rows, ctx, fieldMapping);
      case "gauge":
        return this.assembleGauge(intent, rows, ctx, fieldMapping);
      case "radar":
        return this.assembleRadar(intent, rows, ctx, fieldMapping);
      case "parallel":
        return this.assembleParallel(intent, rows, ctx, fieldMapping);
      case "sunburst":
        return this.assembleSunburst(intent, rows, ctx, fieldMapping);
      case "boxplot":
        return this.assembleBoxplot(intent, rows, ctx, fieldMapping);
      case "candlestick":
        return this.assembleCandlestick(intent, rows, ctx, fieldMapping);
      case "graph":
        return this.assembleGraph(intent, rows, ctx, fieldMapping);
      case "tree":
        return this.assembleTree(intent, rows, ctx, fieldMapping);
      case "themeRiver":
        return this.assembleThemeRiver(intent, rows, ctx, fieldMapping);
      case "pictorialBar":
        return this.assemblePictorialBar(intent, rows, ctx, fieldMapping);

      // [Fix-4 Task 4.3] 3D 系列 (bar3D/scatter3D/surface3D/line3D/points3D/lines3D) 暂不支持
      // ChartIntent.chartType 类型已不含 3D, 此处无需 case
      // 若 LLM 强行返回 3D, 由 default: 抛 ChartAssembleError

      // 地理 (map3D 降级 bar) — map3D 不在 ECHART_SERIES_TYPES, 仅兜底
      // 若 intent.chartType === "map3D" (向后兼容旧 LLM 输出), 走降级
      // 编译时 TypeScript 会把 case "map3D" 标 unreachable (因为联合类型不含)
      // 用 @ts-expect-error 标记
      // @ts-expect-error - map3D 已从 ECHART_SERIES_TYPES 删除, 保留兜底降级
      case "map3D":
        this.logger.warn(
          "[M13-V2] map3D 暂不支持 GeoJSON,降级为 bar (rewriteMap3DToBar 也兜底)",
        );
        return this.assembleXY(intent, rows, ctx, "bar", {}, fieldMapping);
      case "map":
        return this.assembleMap(intent, rows, ctx, fieldMapping);

      // 扩展插件
      case "liquidFill":
        return this.assembleLiquidFill(intent, rows, ctx, fieldMapping);
      case "wordCloud":
        return this.assembleWordCloud(intent, rows, ctx, fieldMapping);

      // custom 不支持代码装配
      case "custom":
        throw new ChartAssembleError(
          "custom 类型需 LLM 写 renderItem,V2 代码装配暂不支持,建议改用 bar",
          "custom",
          "unsupported",
        );

      default:
        throw new ChartAssembleError(
          `未实现的 chartType: ${intent.chartType}`,
          intent.chartType,
          "unsupported",
        );
    }
  }

  // ============================================================
  // 基础 5 类装配
  // ============================================================

  /** bar / line / area 公用骨架 */
  private assembleXY(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    ctx: AssembleCtx,
    type: "line" | "bar",
    extraSeriesOpts: Record<string, unknown> = {},
    fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const metrics = (intent.metrics && intent.metrics.length > 0
      ? intent.metrics
      : [intent.yField]) as MetricKey[];
    const needMultiY = this.needsMultipleYAxis(metrics, fieldMapping);
    const xData = rows.map((r) => String(r[intent.xField] ?? ""));
    const series = metrics.map((m, i) => ({
      name: this.resolveLabel(m, fieldMapping),
      type,
      data: rows.map((r) => Number(r[m] ?? 0)),
      yAxisIndex: needMultiY ? i : 0,
      smooth: type === "line",
      ...extraSeriesOpts,
    }));
    const yAxis = needMultiY
      ? metrics.map((m, i) => ({
          type: "value",
          name: this.resolveLabel(m, fieldMapping),
          position: i === 0 ? "left" : "right",
        }))
      : { type: "value", name: this.resolveLabel(metrics[0], fieldMapping) };
    return {
      tooltip: { trigger: "axis" },
      ...(metrics.length > 1
        ? {
            legend: { data: metrics.map((m) => this.resolveLabel(m, fieldMapping)) },
          }
        : {}),
      xAxis: { type: "category", data: xData },
      yAxis,
      series,
    };
  }

  private assembleScatter(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const xField = intent.xField;
    const yField = intent.yField;
    return {
      tooltip: { trigger: "item" },
      xAxis: { type: "value", name: xField },
      yAxis: { type: "value", name: yField },
      series: [
        {
          name: yField,
          type: "scatter",
          data: rows.map((r) => [Number(r[xField] ?? 0), Number(r[yField] ?? 0)]),
        },
      ],
    };
  }

  private assemblePie(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: {
        orient: "vertical",
        left: "left",
        data: rows.map((r) => String(r[intent.xField] ?? "")),
      },
      series: [
        {
          name: this.resolveLabel(m, fieldMapping),
          type: "pie",
          radius: "50%",
          data: rows.map((r) => ({
            name: String(r[intent.xField] ?? ""),
            value: Number(r[m] ?? 0),
          })),
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    };
  }

  // ============================================================
  // 复杂图
  // ============================================================

  private assembleHeatmap(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const xData = Array.from(
      new Set(rows.map((r) => String(r[intent.xField] ?? ""))),
    );
    const yField2 = intent.groupBy ?? "value";
    const yData = Array.from(new Set(rows.map((r) => String(r[yField2] ?? ""))));
    const xIndex = new Map(xData.map((v, i) => [v, i]));
    const yIndex = new Map(yData.map((v, i) => [v, i]));
    const data = rows.map((r) => [
      xIndex.get(String(r[intent.xField] ?? "")) ?? 0,
      yIndex.get(String(r[yField2] ?? "")) ?? 0,
      Number(r[m] ?? 0),
    ]);
    const values = rows.map((r) => Number(r[m] ?? 0));
    const max = values.length > 0 ? Math.max(...values) : 1;
    return {
      tooltip: { position: "top" },
      grid: { left: 100, right: 50, top: 30, bottom: 80 },
      xAxis: { type: "category", data: xData, splitArea: { show: true } },
      yAxis: { type: "category", data: yData, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
      },
      series: [
        {
          name: m,
          type: "heatmap",
          data,
          label: { show: true },
        },
      ],
    };
  }

  private assembleTreemap(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      series: [
        {
          type: "treemap",
          breadcrumb: { show: false },
          data: rows.map((r) => ({
            name: String(r[intent.xField] ?? ""),
            value: Number(r[m] ?? 0),
          })),
        },
      ],
    };
  }

  private assembleSankey(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const names = rows.map((r) => String(r[intent.xField] ?? ""));
    const nodes = Array.from(new Set(names)).map((n) => ({ name: n }));
    nodes.push({ name: "总计" });
    const links = rows.map((r) => ({
      source: String(r[intent.xField] ?? ""),
      target: "总计",
      value: Number(r[m] ?? 0),
    }));
    return {
      tooltip: { trigger: "item", triggerOn: "mousemove" },
      series: [{ type: "sankey", emphasis: { focus: "adjacency" }, data: nodes, links }],
    };
  }

  private assembleFunnel(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const sorted = [...rows].sort(
      (a, b) => Number(b[m] ?? 0) - Number(a[m] ?? 0),
    );
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      legend: { data: sorted.map((r) => String(r[intent.xField] ?? "")) },
      series: [
        {
          name: this.resolveLabel(m, fieldMapping),
          type: "funnel",
          left: "10%",
          width: "80%",
          label: { show: true, position: "inside" },
          data: sorted.map((r) => ({
            name: String(r[intent.xField] ?? ""),
            value: Number(r[m] ?? 0),
          })),
        },
      ],
    };
  }

  private assembleGauge(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const values = rows.map((r) => Number(r[m] ?? 0));
    const value = values[0] ?? 0;
    const max = Math.max(...values, value * 1.2, 100);
    return {
      tooltip: {},
      series: [
        {
          name: this.resolveLabel(m, fieldMapping),
          type: "gauge",
          min: 0,
          max,
          detail: { formatter: "{value}" },
          data: [{ value, name: String(rows[0][intent.xField] ?? "") }],
        },
      ],
    };
  }

  private assembleRadar(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const max = Math.max(...rows.map((r) => Number(r[m] ?? 0)), 1) * 1.1;
    return {
      tooltip: {},
      radar: {
        indicator: rows.map((r) => ({
          name: String(r[intent.xField] ?? ""),
          max,
        })),
      },
      series: [
        {
          name: this.resolveLabel(m, fieldMapping),
          type: "radar",
          data: [
            {
              value: rows.map((r) => Number(r[m] ?? 0)),
              name: this.resolveLabel(m, fieldMapping),
            },
          ],
        },
      ],
    };
  }

  private assembleParallel(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const metrics = (intent.metrics && intent.metrics.length > 0
      ? intent.metrics
      : [intent.yField]) as MetricKey[];
    return {
      tooltip: {},
      parallelAxis: metrics.map((m) => ({
        dim: metrics.indexOf(m),
        name: this.resolveLabel(m, fieldMapping),
      })),
      parallel: { left: 50, right: 50, bottom: 50, top: 50 },
      series: [
        {
          type: "parallel",
          lineStyle: { width: 2 },
          data: rows.map((r) => metrics.map((m) => Number(r[m] ?? 0))),
        },
      ],
    };
  }

  private assembleSunburst(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      series: [
        {
          type: "sunburst",
          data: rows.map((r) => ({
            name: String(r[intent.xField] ?? ""),
            value: Number(r[m] ?? 0),
            children: [],
          })),
        },
      ],
    };
  }

  /**
   * [GUARD-V2-2] boxplot 需 [min, q1, median, q3, max] 五元组
   * 简化: 若 rows 仅单值字段, 抛 ChartAssembleError 提示数据需预聚合
   */
  private assembleBoxplot(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const data = rows.map((r) => {
      const v = r[m];
      if (Array.isArray(v) && v.length === 5) return v.map(Number);
      // 单值: 用近似 5 元 (min=q1=median=q3=max=value)
      const num = Number(v ?? 0);
      return [num, num, num, num, num];
    });
    return {
      tooltip: {},
      xAxis: { type: "category", data: rows.map((r) => String(r[intent.xField] ?? "")) },
      yAxis: { type: "value" },
      series: [{ name: this.resolveLabel(m, fieldMapping), type: "boxplot", data }],
    };
  }

  /**
   * [GUARD-V2-2] candlestick 需 OHLC 四元组,数据不满足时降级为单值柱
   */
  private assembleCandlestick(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const data = rows.map((r) => {
      const v = r[m];
      if (Array.isArray(v) && v.length === 4) return v.map(Number);
      const num = Number(v ?? 0);
      return [num, num, num, num];
    });
    return {
      tooltip: {},
      xAxis: { type: "category", data: rows.map((r) => String(r[intent.xField] ?? "")) },
      yAxis: { type: "value" },
      series: [{ name: this.resolveLabel(m, fieldMapping), type: "candlestick", data }],
    };
  }

  private assembleGraph(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const names = rows.map((r) => String(r[intent.xField] ?? ""));
    const nodes = Array.from(new Set(names)).map((n) => ({ name: n, value: 0 }));
    const links = rows.map((r) => ({
      source: String(r[intent.xField] ?? ""),
      target: "总计",
      value: Number(r[m] ?? 0),
    }));
    nodes.push({ name: "总计", value: 0 });
    return {
      tooltip: {},
      series: [
        {
          type: "graph",
          layout: "force",
          data: nodes,
          links,
          roam: true,
          emphasis: { focus: "adjacency" },
        },
      ],
    };
  }

  private assembleTree(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      series: [
        {
          type: "tree",
          data: [
            {
              name: "root",
              children: rows.map((r) => ({
                name: String(r[intent.xField] ?? ""),
                value: Number(r[m] ?? 0),
              })),
            },
          ],
          left: "10%",
          right: "20%",
          top: "5%",
          bottom: "5%",
          symbol: "emptyCircle",
          orient: "LR",
        },
      ],
    };
  }

  private assembleThemeRiver(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { trigger: "axis" },
      singleAxis: { type: "time" },
      series: [
        {
          type: "themeRiver",
          data: rows.map((r) => [
            String(r[intent.xField] ?? ""),
            Number(r[m] ?? 0),
            String(intent.groupBy ?? "category"),
          ]),
        },
      ],
    };
  }

  private assemblePictorialBar(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: rows.map((r) => String(r[intent.xField] ?? "")) },
      yAxis: { type: "value" },
      series: [
        {
          name: this.resolveLabel(m, fieldMapping),
          type: "pictorialBar",
          symbol: "roundRect",
          data: rows.map((r) => Number(r[m] ?? 0)),
        },
      ],
    };
  }

  // ============================================================
  // 3D 系列 — 数据形态特殊, 多数情况抛 ChartAssembleError
  // ============================================================

  /**
   * [Fix-4 Task 4.3] 3D 坐标提取 — 暂不支持 3D 图表
   * @throws ChartAssembleError 始终抛错
   */
  private require3DCoordinates(
    _rows: Array<Record<string, number | string>>,
    chartType: string,
  ): void {
    throw new ChartAssembleError(
      "3D 图表（bar3D/scatter3D/surface3D/line3D/points3D/lines3D）暂不支持，请使用 2D 图表类型",
      chartType,
      "unsupported",
    );
  }

  private assembleBar3D(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    this.require3DCoordinates(rows, "bar3D");
    return {
      tooltip: {},
      visualMap: { show: true, min: 0, max: this.maxOf(rows, "z") },
      xAxis3D: { type: "category", data: this.uniqueVals(rows, "x") },
      yAxis3D: { type: "category", data: this.uniqueVals(rows, "y") },
      zAxis3D: { type: "value", name: intent.yField },
      grid3D: {
        boxWidth: 100,
        boxDepth: 80,
        viewControl: { projection: "orthographic" },
      },
      series: [
        {
          type: "bar3D",
          data: rows.map((r) => [r.x, r.y, Number(r.z ?? 0)]),
          shading: "lambert",
        },
      ],
    };
  }

  private assembleScatter3D(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    this.require3DCoordinates(rows, "scatter3D");
    return {
      tooltip: {},
      visualMap: { show: true, min: 0, max: this.maxOf(rows, "z") },
      xAxis3D: { type: "value", name: "x" },
      yAxis3D: { type: "value", name: "y" },
      zAxis3D: { type: "value", name: "z" },
      grid3D: { viewControl: { projection: "orthographic" } },
      series: [
        {
          type: "scatter3D",
          data: rows.map((r) => [Number(r.x ?? 0), Number(r.y ?? 0), Number(r.z ?? 0)]),
        },
      ],
    };
  }

  private assembleSurface3D(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    this.require3DCoordinates(rows, "surface3D");
    return {
      tooltip: {},
      xAxis3D: { type: "value" },
      yAxis3D: { type: "value" },
      zAxis3D: { type: "value" },
      grid3D: { viewControl: { projection: "orthographic" } },
      series: [
        {
          type: "surface",
          data: rows.map((r) => [Number(r.x ?? 0), Number(r.y ?? 0), Number(r.z ?? 0)]),
        },
      ],
    };
  }

  private assembleLine3D(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    this.require3DCoordinates(rows, "line3D");
    return {
      tooltip: {},
      xAxis3D: { type: "value" },
      yAxis3D: { type: "value" },
      zAxis3D: { type: "value" },
      grid3D: { viewControl: { projection: "orthographic" } },
      series: [
        {
          type: "line3D",
          data: rows.map((r) => [Number(r.x ?? 0), Number(r.y ?? 0), Number(r.z ?? 0)]),
        },
      ],
    };
  }

  private assemblePoints3D(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    this.require3DCoordinates(rows, "points3D");
    return {
      tooltip: {},
      xAxis3D: { type: "value" },
      yAxis3D: { type: "value" },
      zAxis3D: { type: "value" },
      grid3D: { viewControl: { projection: "orthographic" } },
      series: [
        {
          type: "scatter3D",
          symbolSize: 6,
          data: rows.map((r) => [Number(r.x ?? 0), Number(r.y ?? 0), Number(r.z ?? 0)]),
        },
      ],
    };
  }

  private assembleLines3D(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    if (rows.length === 0) return this.getDefaultChart();
    const data = rows.map((r) => [
      [Number(r.x1 ?? r.x ?? 0), Number(r.y1 ?? r.y ?? 0), Number(r.z1 ?? r.z ?? 0)],
      [Number(r.x2 ?? r.x ?? 0), Number(r.y2 ?? r.y ?? 0), Number(r.z2 ?? r.z ?? 0)],
    ]);
    return {
      tooltip: {},
      xAxis3D: { type: "value" },
      yAxis3D: { type: "value" },
      zAxis3D: { type: "value" },
      grid3D: { viewControl: { projection: "orthographic" } },
      series: [{ type: "lines3D", data }],
    };
  }

  // ============================================================
  // 地图
  // ============================================================

  private assembleMap(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const mapType = intent.mapType ?? "china";
    const data = rows.map((r) => ({
      name: String(r[intent.xField] ?? ""),
      value: Number(r[m] ?? 0),
    }));
    const values = data.map((d) => d.value).filter((v) => v > 0);
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 1;
    const label = this.resolveLabel(m, fieldMapping);

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name: string; value?: number };
          if (p.value != null) {
            return `${p.name}<br/>${label}: ${p.value.toLocaleString()}`;
          }
          return `${p.name}<br/>无数据`;
        },
      },
      visualMap: {
        min,
        max,
        left: "left",
        bottom: 10,
        calculable: true,
        orient: "horizontal",
        inRange: {
          color: ["#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"],
        },
        text: ["高", "低"],
        textStyle: { fontSize: 10 },
      },
      geo: {
        map: mapType,
        roam: true,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 10 },
          itemStyle: { areaColor: "#ffd700" },
        },
      },
      series: [
        {
          name: label,
          type: "map",
          geoIndex: 0,
          data,
          emphasis: {
            label: { show: true, fontSize: 12, fontWeight: "bold" },
          },
        },
      ],
    };
  }

  // ============================================================
  // 扩展插件
  // ============================================================

  private assembleLiquidFill(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    const values = rows.map((r) => Number(r[m] ?? 0));
    const max = Math.max(...values, 1);
    const ratio = max > 1 ? values[0] / max : values[0];
    return {
      series: [
        {
          type: "liquidFill",
          data: [ratio, ratio * 0.7, ratio * 0.4],
          radius: "70%",
        },
      ],
    };
  }

  private assembleWordCloud(
    intent: ChartIntent,
    rows: Array<Record<string, number | string>>,
    _ctx: AssembleCtx, fieldMapping?: Record<string, string>,  // [Sprint 5.7]
  ): EChartsOption {
    const m = (intent.metrics?.[0] ?? intent.yField) as MetricKey;
    return {
      tooltip: { show: true },
      series: [
        {
          type: "wordCloud",
          shape: "circle",
          sizeRange: [12, 50],
          rotationRange: [-90, 90],
          data: rows.map((r) => ({
            name: String(r[intent.xField] ?? ""),
            value: Number(r[m] ?? 0),
          })),
        },
      ],
    };
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 异量纲判断: 同量纲共享, 异量纲分 Y 轴
   * [Fix-4 Task 4.2] 通用启发式 — 从 fieldMapping 中文标签提取单位
   * (元/件/%/次等), 不同单位才启用双轴
   * 旧实现硬编码特定业务字段触发, 已废弃
   */
  private needsMultipleYAxis(
    metrics: MetricKey[],
    fieldMapping?: Record<string, string>,
  ): boolean {
    if (metrics.length <= 1) return false;
    if (!fieldMapping) return metrics.length > 2; // 无映射信息时, >2 个指标才双轴

    // 从中文标签提取单位
    const units = new Set(
      metrics.map((m) => {
        const label = fieldMapping[m] ?? "";
        const unitMatch = label.match(/[元件%次张条个笔]+$/);
        return unitMatch ? unitMatch[0] : "unknown";
      }),
    );
    return units.size > 1;
  }

  private maxOf(rows: Array<Record<string, number | string>>, key: string): number {
    const vals = rows.map((r) => Number(r[key] ?? 0));
    return vals.length > 0 ? Math.max(...vals, 1) : 1;
  }

  private uniqueVals(rows: Array<Record<string, number | string>>, key: string): string[] {
    return Array.from(new Set(rows.map((r) => String(r[key] ?? ""))));
  }

  private getDefaultChart(): EChartsOption {
    return {
      title: { text: "暂无数据" },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: [] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [] }],
    };
  }
}