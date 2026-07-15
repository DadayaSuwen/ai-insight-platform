import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { DatasourceService } from "../datasource/datasource.service";
import { MetadataService } from "../datasource/metadata/metadata.service";
import { LlmService } from "../ai/llm/llm.service";
import { z } from "zod";

/**
 * [Sprint 6] DashboardGeneratorService — LLM 驱动的自动工作台生成
 *
 * 输入: DataSource 的 schemaUnderstanding (已确认的 Schema 理解 JSON)
 * 输出: { kpis, charts, insights }
 *
 * Prompt 设计见 flowagent 技术方案 4.2 节
 */

/* ─── Zod schemas ─── */

const KpiSchema = z.object({
  label: z.string(),
  table: z.string(),
  metric: z.string(),
  filter: z.string().optional(),
  icon: z.string().optional(),
  comparison: z.string().optional(),
});

const ChartSpecSchema = z.object({
  title: z.string(),
  type: z.string(),
  table: z.string(),
  timeField: z.string().optional(),
  metric: z.string(),
  groupBy: z.string().optional(),
  interval: z.string().optional(),
  range: z.string().optional(),
});

const InsightSpecSchema = z.object({
  type: z.enum(["trend_anomaly", "distribution_change", "opportunity", "risk"]),
  table: z.string(),
  metric: z.string(),
  description: z.string(),
});

const DashboardConfigSchema = z.object({
  kpis: z.array(KpiSchema).min(1).max(8),
  charts: z.array(ChartSpecSchema).min(1).max(6),
  insights: z.array(InsightSpecSchema).min(1).max(5),
});

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;

@Injectable()
export class DashboardGeneratorService {
  private readonly logger = new Logger(DashboardGeneratorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ds: DatasourceService,
    private readonly meta: MetadataService,
    private readonly llm: LlmService,
  ) {}

  /**
   * 基于 Schema Understanding 生成工作台配置
   */
  async generate(
    datasourceId: string,
    userId: string,
  ): Promise<DashboardConfig> {
    const record = await this.ds.getByIdForUser(datasourceId, userId);
    if (!record) throw new Error("DataSource not found");

    // 优先使用已保存的 schemaUnderstanding
    const understanding =
      (record.schemaUnderstanding as Record<string, unknown>) ??
      (await this.meta.get(datasourceId));

    if (!understanding) {
      throw new Error("No schema understanding available. Run explore first.");
    }

    try {
      const config = await this.llm.invokeStructured({
        system:
          "你是高级数据分析师。基于已确认的数据库 Schema 理解，自动生成一个数据分析工作台配置。",
        human: this.buildPrompt(understanding),
        schema: DashboardConfigSchema,
        temperature: 0.3,
        timeoutMs: 30_000,
      });

      this.logger.log(
        `Dashboard generated for ${datasourceId}: ${config.kpis.length} KPIs, ${config.charts.length} charts, ${config.insights.length} insights`,
      );

      // 论文创新点 #3：持久化生成的 dashboard 配置到 DataSource.schemaUnderstanding.dashboard
      // 简化版：先读 schemaUnderstanding，合并 dashboard 子键，再写回
      const persistedUnderstanding =
        ((await this.ds.getByIdForUser(datasourceId, userId))
          ?.schemaUnderstanding as Record<string, unknown> | null) ??
        {};
      persistedUnderstanding.dashboard = config;
      await this.db.db
        .updateTable("DataSource")
        .set({
          schemaUnderstanding: persistedUnderstanding as unknown as Record<string, unknown>,
        })
        .where("id", "=", datasourceId)
        .execute();

      return config;
    } catch (err) {
      this.logger.warn(
        `Dashboard generation failed for ${datasourceId}, using fallback: ${(err as Error).message}`,
      );
      const fallback = this.fallbackConfig(understanding);
      // fallback 也持久化, 保证 getConfig 至少能返回一份基础配置
      const persistedUnderstanding =
        ((await this.ds.getByIdForUser(datasourceId, userId))
          ?.schemaUnderstanding as Record<string, unknown> | null) ??
        {};
      persistedUnderstanding.dashboard = fallback;
      await this.db.db
        .updateTable("DataSource")
        .set({
          schemaUnderstanding: persistedUnderstanding as unknown as Record<string, unknown>,
        })
        .where("id", "=", datasourceId)
        .execute();
      return fallback;
    }
  }

  /**
   * 获取已生成的工作台配置 (从 DataSource.schemaUnderstanding 的子字段)
   */
  async getConfig(
    datasourceId: string,
    userId: string,
  ): Promise<DashboardConfig | null> {
    const record = await this.ds.getByIdForUser(datasourceId, userId);
    if (!record) return null;

    const understanding = record.schemaUnderstanding as Record<string, unknown> | null;
    if (!understanding) return null;

    const dashboard = understanding.dashboard as DashboardConfig | undefined;
    return dashboard ?? null;
  }

  /* ─── helpers ─── */

  private buildPrompt(understanding: Record<string, unknown>): string {
    const tables = (understanding.tables as Array<Record<string, unknown>>) ?? [];
    const tableLines = tables
      .map((t) => {
        const cols = (t.columns as Array<Record<string, unknown>>) ?? [];
        const colLines = cols
          .map(
            (c) =>
              `  - ${c.name} (${c.rawType}): ${c.chineseName ?? c.name} [role=${c.semanticRole}]`,
          )
          .join("\n");
        return `表: ${t.name} (${t.rowCount ?? "?"} 行)\n${colLines}`;
      })
      .join("\n\n");

    return `基于以下已确认的数据库 Schema 理解，自动生成一个数据分析师会用的工作台配置：

## Schema 理解
${tableLines}

## 你的任务
输出 JSON 工作台配置:
{
  "kpis": [
    {
      "label": "核心指标名称",
      "table": "表名",
      "metric": "COUNT(*) 或 SUM(column) 或 AVG(column)",
      "filter": "可选, 如 created_at >= THIS_MONTH",
      "icon": "可选 emoji",
      "comparison": "PREVIOUS_MONTH 或 PREVIOUS_WEEK"
    }
  ],
  "charts": [
    {
      "title": "图表标题",
      "type": "line | bar | pie | area",
      "table": "表名",
      "timeField": "时间字段 (趋势图必填)",
      "metric": "COUNT(*) 或 SUM(column)",
      "groupBy": "分组字段 (饼图/柱状图必填)",
      "interval": "month | week | day (趋势图)",
      "range": "12m | 6m | 3m (时间范围)"
    }
  ],
  "insights": [
    {
      "type": "trend_anomaly | distribution_change | opportunity | risk",
      "table": "表名",
      "metric": "监控的指标",
      "description": "需要监控什么"
    }
  ]
}

## 选择原则
1. KPI 选 4-6 个，覆盖核心实体的关键指标（总订单数、总销售额、客户数、客单价、完成率）
2. 图表选 3-5 张，包含趋势(line)、分布(pie/bar)、对比(bar)
3. 洞察选 3 条，基于异常检测（Z-score > 2 或环比变化 > 30%）
4. 时间字段优先选 created_at / updated_at / order_date
5. 指标字段优先选 role=measure 的字段
6. 维度字段优先选 role=dimension 的字段
7. 不要选择敏感字段作为维度展示

只返回 JSON，不要额外文字。`;
  }

  /**
   * 兜底配置 — LLM 失败时基于规则生成
   */
  private fallbackConfig(
    understanding: Record<string, unknown>,
  ): DashboardConfig {
    const tables = (understanding.tables as Array<Record<string, unknown>>) ?? [];
    const allCols: Array<{
      table: string;
      name: string;
      rawType: string;
      chineseName: string;
      semanticRole: string;
    }> = [];

    for (const t of tables) {
      const cols = (t.columns as Array<Record<string, unknown>>) ?? [];
      for (const c of cols) {
        allCols.push({
          table: t.name as string,
          name: c.name as string,
          rawType: c.rawType as string,
          chineseName: (c.chineseName as string) ?? (c.name as string),
          semanticRole: (c.semanticRole as string) ?? "identifier",
        });
      }
    }

    const measures = allCols.filter((c) => c.semanticRole === "measure");
    const dimensions = allCols.filter((c) => c.semanticRole === "dimension");
    const timeFields = allCols.filter((c) => c.semanticRole === "time");
    const mainTable = (tables[0]?.name as string) ?? "unknown";

    const kpis = measures.slice(0, 5).map((m) => ({
      label: m.chineseName,
      table: m.table,
      metric: `SUM(${m.name})`,
      icon: "📊",
    }));

    const charts = [];
    if (timeFields.length > 0 && measures.length > 0) {
      charts.push({
        title: `${measures[0].chineseName}趋势`,
        type: "line" as const,
        table: measures[0].table,
        timeField: timeFields[0].name,
        metric: `SUM(${measures[0].name})`,
        interval: "month",
        range: "12m",
      });
    }
    if (dimensions.length > 0 && measures.length > 0) {
      charts.push({
        title: `${dimensions[0].chineseName}分布`,
        type: "pie" as const,
        table: measures[0].table,
        metric: `COUNT(*)`,
        groupBy: dimensions[0].name,
      });
    }
    if (measures.length > 1) {
      charts.push({
        title: `${measures[1]?.chineseName ?? "指标"}对比`,
        type: "bar" as const,
        table: measures[1]?.table ?? mainTable,
        metric: `SUM(${measures[1]?.name ?? "*"})`,
        groupBy: dimensions[0]?.name ?? "id",
      });
    }

    const insights = [
      {
        type: "trend_anomaly" as const,
        table: mainTable,
        metric: measures[0]?.name ?? "COUNT(*)",
        description: `监控${measures[0]?.chineseName ?? "核心指标"}的时序异常`,
      },
      {
        type: "distribution_change" as const,
        table: mainTable,
        metric: dimensions[0]?.name ?? "status",
        description: `监控${dimensions[0]?.chineseName ?? "分布"}的变化`,
      },
      {
        type: "opportunity" as const,
        table: mainTable,
        metric: measures[1]?.name ?? measures[0]?.name ?? "COUNT(*)",
        description: `发现${measures[1]?.chineseName ?? "指标"}的优化机会`,
      },
    ];

    return { kpis, charts, insights };
  }
}
