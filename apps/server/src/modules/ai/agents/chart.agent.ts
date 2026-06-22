import { Injectable, Logger } from "@nestjs/common";

/**
 * Chart types supported
 */
export type ChartType = "line" | "bar" | "pie" | "scatter" | "area";

/**
 * ECharts option interface
 */
export interface EChartsOption {
  title?: {
    text: string;
  };
  tooltip?: {
    trigger: string;
  };
  legend?: {
    data: string[];
  };
  xAxis?: {
    type: string;
    data?: unknown[];
  };
  yAxis?: {
    type: string;
  };
  series?: unknown[];
}

/**
 * ChartAgent - Chart Configuration
 * 根据数据生成 ECharts 图表配置
 */
@Injectable()
export class ChartAgent {
  private readonly logger = new Logger(ChartAgent.name);

  /**
   * Generate chart config from data and message
   */
  async generate(data: unknown[], message: string): Promise<EChartsOption> {
    this.logger.log(`Generating chart for ${data.length} records`);

    try {
      // Analyze data structure
      if (!data || data.length === 0) {
        return this.getDefaultChart();
      }

      // Generate chart based on data
      const chart = this.generateFromData(data, message);
      this.logger.log(`Generated chart config`);

      return chart;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Chart generation failed: ${message}`);
      return this.getDefaultChart();
    }
  }

  /**
   * Generate chart config from data
   */
  private generateFromData(data: unknown[], message: string): EChartsOption {
    // Filter out null/undefined entries
    const validData = data.filter((item) => item != null);
    if (validData.length === 0) {
      return this.getDefaultChart();
    }

    const firstRow = validData[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);

    // Determine chart type based on message
    const chartType = this.detectChartType(message);

    // Detect axis columns
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
   * Detect chart type from message
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

    // Default to bar
    return "bar";
  }

  /**
   * Find column by name patterns
   */
  private findColumn(keys: string[], patterns: string[]): string | null {
    for (const pattern of patterns) {
      const found = keys.find((k) =>
        k.toLowerCase().includes(pattern.toLowerCase()),
      );
      if (found) return found;
    }
    return keys[0];
  }

  /**
   * Generate pie chart
   */
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
      tooltip: {
        trigger: "item",
      },
      legend: {
        data: chartData.map((d) => d.name),
      },
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

  /**
   * Generate XY chart (bar, line, area)
   */
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
      tooltip: {
        trigger: "axis",
      },
      xAxis: {
        type: "category",
        data: xData,
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          type: chartType,
          data: yData,
          smooth: true,
        },
      ],
    };
  }

  /**
   * Get default chart
   */
  private getDefaultChart(): EChartsOption {
    return {
      title: {
        text: "数据图表",
      },
      tooltip: {
        trigger: "axis",
      },
      xAxis: {
        type: "category",
        data: [],
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          type: "bar",
          data: [],
        },
      ],
    };
  }
}
