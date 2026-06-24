import { Injectable, Logger } from "@nestjs/common";

export interface EChartsOption {
  [key: string]: any;
}

export interface ChartDataItem {
  name: string;
  value: number;
}

/**
 * ChartHelper - 纯粹的 ECharts 配置生成器
 *
 * 职责：接收已聚合的数据，根据图表类型拼装出符合 ECharts 规范的 JSON 配置。
 * 不调用任何 LLM，纯 TypeScript 逻辑，保证 100% 稳定和极速响应。
 */
@Injectable()
export class ChartHelper {
  private readonly logger = new Logger(ChartHelper.name);

  generate(
    data: ChartDataItem[],
    chartType: string,
    groupField: string,
  ): EChartsOption {
    this.logger.log(`Generating ${chartType} chart for ${data.length} items`);

    if (!data || data.length === 0) {
      return this.getDefaultChart();
    }

    const titleText =
      groupField === "region" ? "按地区销售统计" : "按类别销售统计";

    const baseOption: EChartsOption = {
      title: { text: titleText },
      tooltip: {
        trigger: chartType === "pie" ? "item" : "axis",
        formatter: chartType === "pie" ? "{b}: ¥{c} ({d}%)" : "{b}: ¥{c}",
      },
    };

    if (chartType === "pie") {
      return {
        ...baseOption,
        legend: {
          orient: "vertical",
          left: "left",
          data: data.map((d) => d.name),
        },
        series: [
          {
            name: "销售额",
            type: "pie",
            radius: "50%",
            data: data.map((d) => ({ name: d.name, value: d.value })),
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

    // 默认处理 bar / line
    return {
      ...baseOption,
      xAxis: {
        type: "category",
        data: data.map((d) => d.name),
      },
      yAxis: {
        type: "value",
        name: "销售额 (¥)",
      },
      series: [
        {
          name: "销售额",
          type: chartType,
          data: data.map((d) => d.value),
          itemStyle: { color: "#5470C6" },
        },
      ],
    };
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
