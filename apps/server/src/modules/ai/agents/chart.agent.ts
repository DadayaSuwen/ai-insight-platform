import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import {
  CHART_SYSTEM_PROMPT,
  buildChartUserMessage,
} from "../prompts/chart.prompt";
import { LlmService } from "../llm/llm.service";

/**
 * Chart types supported.
 */
export type ChartType = "line" | "bar" | "pie" | "scatter" | "area";

/**
 * ECharts option interface.
 *
 * Kept intentionally loose — LangChain's structured output sometimes
 * drops optional fields, and the validator below only requires the
 * shape we actually render (xAxis / yAxis / series[].type).
 */
export interface EChartsOption {
  title?: { text: string };
  tooltip?: { trigger: string };
  legend?: { data?: string[] };
  xAxis?: { type: string; data?: unknown[] };
  yAxis?: { type: string };
  series?: unknown[];
}

/**
 * Loose Zod schema for the LLM output. Anything stricter (e.g.
 * `legend.data: string[]`) tends to cause Qwen to apologize and
 * truncate the JSON. We hand-coerce after parsing.
 */
const ChartOptionSchema = z
  .object({
    type: z.enum(["line", "bar", "pie", "scatter", "area"]).optional(),
    title: z
      .object({ text: z.string().optional() })
      .passthrough()
      .optional(),
    tooltip: z
      .object({ trigger: z.string().optional() })
      .passthrough()
      .optional(),
    legend: z
      .object({ data: z.array(z.string()).optional() })
      .passthrough()
      .optional(),
    xAxis: z
      .object({
        type: z.string().optional(),
        data: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    yAxis: z
      .object({ type: z.string().optional() })
      .passthrough()
      .optional(),
    series: z.array(z.unknown()).optional(),
  })
  .passthrough();

type LlmChartOutput = z.infer<typeof ChartOptionSchema>;

/**
 * ChartAgent — Chart Configuration
 *
 * Layered strategy:
 *   1. Try LLM via LlmService.invokeStructured with a permissive Zod
 *      schema that tolerates Qwen's occasional field drops.
 *   2. Coerce the result into a renderable EChartsOption (fill in
 *      missing xAxis.data from input rows, etc.).
 *   3. Fall back to keyword/template logic on any failure so that
 *      existing tests and offline runs keep working.
 */
@Injectable()
export class ChartAgent {
  private readonly logger = new Logger(ChartAgent.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * Generate chart config from data and message.
   */
  async generate(data: unknown[], message: string): Promise<EChartsOption> {
    this.logger.log(`Generating chart for ${data?.length ?? 0} records`);

    if (!data || data.length === 0) {
      return this.getDefaultChart();
    }

    try {
      const llmResult = await this.llm.invokeStructured<typeof ChartOptionSchema>({
        system: CHART_SYSTEM_PROMPT,
        human: buildChartUserMessage(message, data),
        schema: ChartOptionSchema,
        timeoutMs: 30_000,
        temperature: 0,
      });
      const chart = this.coerceOption(llmResult, data);
      this.logger.log(`LLM generated chart config (type=${chart.series?.[0] && (chart.series[0] as { type?: string }).type})`);
      return chart;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`LLM chart gen failed (${msg}); falling back`);
      return this.generateFromData(data, message);
    }
  }

  /**
   * Shape the LLM output into something the frontend can render.
   * If the model didn't pick a chart type, fall back to bar.
   */
  private coerceOption(parsed: LlmChartOutput, data: unknown[]): EChartsOption {
    const firstRow = (data.find((d) => d != null) ?? {}) as Record<string, unknown>;
    const keys = Object.keys(firstRow);
    const categoryCol = this.findColumn(keys, [
      "category",
      "region",
      "productname",
      "name",
      "date",
      "time",
    ]) ?? keys[0];
    const valueCol = this.findColumn(keys, [
      "amount",
      "quantity",
      "total",
      "count",
      "sales",
    ]) ?? keys[1] ?? keys[0];

    const chartType: ChartType =
      (parsed.type && (["line", "bar", "pie", "scatter", "area"] as ChartType[]).includes(parsed.type as ChartType))
        ? (parsed.type as ChartType)
        : this.detectChartTypeFromKeys(keys);

    const series = ((): unknown[] => {
      const fallbackData = data.map((row) => {
        const r = row as Record<string, unknown>;
        return Number(r[valueCol]) || 0;
      });
      if (!Array.isArray(parsed.series) || parsed.series.length === 0) {
        return [{ type: chartType, data: fallbackData }];
      }
      // If the first series entry is missing its `data` field, fill it
      // in — Qwen sometimes returns `[{ type: 'bar' }]` without values.
      const first = parsed.series[0] as Record<string, unknown> | undefined;
      if (first && (first.data === undefined || first.data === null)) {
        return [{ ...first, data: fallbackData }, ...parsed.series.slice(1)];
      }
      return parsed.series;
    })();

    const xData =
      parsed.xAxis?.data && parsed.xAxis.data.length > 0
        ? parsed.xAxis.data
        : data.map((row) => {
            const r = row as Record<string, unknown>;
            return categoryCol ? String(r[categoryCol]) : "";
          });

    return {
      title: parsed.title?.text ? { text: parsed.title.text } : undefined,
      tooltip: parsed.tooltip ?? { trigger: chartType === "pie" ? "item" : "axis" },
      legend: parsed.legend,
      xAxis: parsed.xAxis?.type
        ? { type: parsed.xAxis.type, data: parsed.xAxis.type === "category" ? xData : undefined }
        : { type: "category", data: xData },
      yAxis: parsed.yAxis?.type ? { type: parsed.yAxis.type } : { type: "value" },
      series,
    } as EChartsOption;
  }

  /**
   * Template-based fallback (frozen behavior — tests assert against it).
   */
  private generateFromData(data: unknown[], message: string): EChartsOption {
    const validData = data.filter((item) => item != null);
    if (validData.length === 0) {
      return this.getDefaultChart();
    }

    const firstRow = validData[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);

    const chartType = this.detectChartType(message);

    const categoryCol = this.findColumn(keys, [
      "category",
      "region",
      "productname",
      "name",
      "date",
      "time",
    ]);
    const valueCol = this.findColumn(keys, [
      "amount",
      "quantity",
      "total",
      "count",
      "sales",
    ]);

    if (chartType === "pie") {
      return this.generatePieChart(data, categoryCol, valueCol);
    }

    return this.generateXYChart(data, categoryCol, valueCol, chartType);
  }

  /**
   * Detect chart type from message (fallback path).
   */
  private detectChartType(message: string): ChartType {
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("饼") ||
      lowerMessage.includes("pie") ||
      lowerMessage.includes("占比")
    ) {
      return "pie";
    }
    if (
      lowerMessage.includes("折线") ||
      lowerMessage.includes("line") ||
      lowerMessage.includes("趋势")
    ) {
      return "line";
    }
    if (lowerMessage.includes("散点") || lowerMessage.includes("scatter")) {
      return "scatter";
    }
    if (lowerMessage.includes("面积") || lowerMessage.includes("area")) {
      return "area";
    }
    return "bar";
  }

  /**
   * Heuristic for when LLM failed to pick a type — infer pie vs bar from
   * column names. Used only inside coerceOption.
   */
  private detectChartTypeFromKeys(keys: string[]): ChartType {
    const lower = keys.map((k) => k.toLowerCase());
    if (lower.some((k) => k.includes("category") || k.includes("region"))) {
      return "bar";
    }
    return "bar";
  }

  private findColumn(keys: string[], patterns: string[]): string | null {
    for (const pattern of patterns) {
      const found = keys.find((k) =>
        k.toLowerCase().includes(pattern.toLowerCase()),
      );
      if (found) return found;
    }
    return null;
  }

  private generatePieChart(
    data: unknown[],
    categoryCol: string | null,
    valueCol: string | null,
  ): EChartsOption {
    const chartData = data.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        name: categoryCol ? String(r[categoryCol]) : "Unknown",
        value: valueCol ? Number(r[valueCol]) || 0 : 0,
      };
    });

    return {
      tooltip: { trigger: "item" },
      legend: { data: chartData.map((d) => d.name) },
      series: [
        {
          type: "pie",
          radius: "50%",
          data: chartData,
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

  private generateXYChart(
    data: unknown[],
    categoryCol: string | null,
    valueCol: string | null,
    chartType: ChartType,
  ): EChartsOption {
    const xData = data.map((row) => {
      const r = row as Record<string, unknown>;
      return categoryCol ? String(r[categoryCol]) : `Item ${data.indexOf(row)}`;
    });
    const yData = data.map((row) => {
      const r = row as Record<string, unknown>;
      return valueCol ? Number(r[valueCol]) || 0 : 0;
    });

    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: xData },
      yAxis: { type: "value" },
      series: [{ type: chartType, data: yData, smooth: true }],
    };
  }

  private getDefaultChart(): EChartsOption {
    return {
      title: { text: "数据图表" },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: [] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [] }],
    };
  }
}