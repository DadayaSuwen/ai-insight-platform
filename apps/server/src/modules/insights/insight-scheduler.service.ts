import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as cron from "node-cron";
import { DatabaseService } from "../database/database.service";
import { InsightAgent } from "../ai/agents/insight.agent";
import { DatasourceService } from "../datasource/datasource.service";
import { ExecutorFactory } from "../datasource/executors/executor.factory";
import {
  detectZScoreAnomaly,
  detectChangeRate,
  detectTrend,
  type AnomalyResult,
} from "./anomaly-detector";

/**
 * [Sprint 6] InsightSchedulerService — 主动洞察定时巡检
 *
 * 每日 8:00 自动巡检所有 finalized 数据源:
 *   1. 统计异常检测 (Z-score / 环比 / 趋势)
 *   2. LLM 语义分析 (InsightAgent)
 *   3. 持久化到 Insight 表
 *
 * 提供:
 *   - runForDataSource(id) — 手动触发单个数据源
 *   - runAll() — 手动触发全部
 */

const CRON_SCHEDULE = "0 8 * * *"; // 每日 08:00

export interface DetectionLog {
  dsId: string;
  startedAt: string;
  durationMs: number;
  results: AnomalyResult[];
  status: "success" | "error" | "skipped";
  error?: string;
}

@Injectable()
export class InsightSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InsightSchedulerService.name);
  private task: cron.ScheduledTask | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly insightAgent: InsightAgent,
    private readonly datasourceService: DatasourceService,
    private readonly executorFactory: ExecutorFactory,
  ) {}

  onModuleInit() {
    if (process.env.DISABLE_INSIGHTS_CRON === "1") {
      this.logger.warn("Insight cron disabled by env");
      return;
    }

    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.logger.log("Daily insight cron triggered");
      void this.runAll().catch((err) =>
        this.logger.error(`Insight cron failed: ${(err as Error).message}`),
      );
    });

    this.logger.log(`InsightScheduler started (cron: ${CRON_SCHEDULE})`);
  }

  /**
   * 巡检所有 finalized 数据源
   */
  async runAll(): Promise<DetectionLog[]> {
    const datasources = await this.db.db
      .selectFrom("DataSource")
      .select(["id", "name", "userId"])
      .where("exploreStatus", "=", "finalized")
      .execute();

    this.logger.log(`Insight scan started for ${datasources.length} datasources`);

    const logs: DetectionLog[] = [];

    for (const ds of datasources) {
      const log = await this.runForDataSource(ds.id, ds.userId);
      logs.push(log);
    }

    return logs;
  }

  /**
   * 巡检单个数据源
   */
  async runForDataSource(datasourceId: string, userId: string): Promise<DetectionLog> {
    const startedAt = new Date();
    const log: DetectionLog = {
      dsId: datasourceId,
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      results: [],
      status: "success",
    };

    try {
      // 1. 拉取 schemaUnderstanding 中的业务字段
      const ds = await this.db.db
        .selectFrom("DataSource")
        .selectAll()
        .where("id", "=", datasourceId)
        .executeTakeFirst();

      if (!ds || ds.exploreStatus !== "finalized") {
        log.status = "skipped";
        log.error = "DataSource not finalized";
        return log;
      }

      const understanding = ds.schemaUnderstanding as Record<string, unknown> | null;
      if (!understanding) {
        log.status = "skipped";
        log.error = "No schema understanding";
        return log;
      }

      // 2. 异常检测 — 检测 Demo 数据
      // (生产环境应从外部数据源拉取时序数据)
      const sampleMetrics = await this.fetchSampleMetrics(datasourceId);

      for (const metric of sampleMetrics) {
        const zAnomalies = detectZScoreAnomaly(metric.values);
        const trend = detectTrend(metric.values);

        if (zAnomalies.length > 0) log.results.push(...zAnomalies);
        if (trend) log.results.push(trend);
      }

      // 3. 论文创新点 #4：LLM 语义分析 —— 用 InsightAgent 生成结构化洞察
      // 替代原来的 "直接存统计结果" —— 让 LLM 给业务可读的摘要 + 建议
      for (const result of log.results.slice(0, 3)) {
        try {
          const llmInsight = await this.insightAgent.generate({
            question: `${result.title} 异常检测 (类型: ${result.type}, 严重度: ${result.severity})`,
            data: {
              anomaly: result,
              evidence: result.evidence,
            },
            focus: "anomaly",
          });

          // 合并 LLM 输出与统计检测结果 (LLM 优先, 缺失字段降级到统计)
          await this.persistInsight(datasourceId, {
            ...result,
            title: llmInsight.summary || result.title,
            description:
              llmInsight.insights?.[0]?.detail || result.description,
            suggestion: llmInsight.recommendation || result.suggestion,
          });
        } catch (err) {
          this.logger.warn(
            `LLM 洞察生成失败，降级用统计结果: ${(err as Error).message}`,
          );
          await this.persistInsight(datasourceId, result);
        }
      }

      // 4. 写巡检日志
      log.durationMs = Date.now() - startedAt.getTime();
      this.logger.log(
        `Insight scan complete for ${datasourceId}: ${log.results.length} anomalies in ${log.durationMs}ms`,
      );
    } catch (err) {
      log.status = "error";
      log.error = (err as Error).message;
      this.logger.error(`Insight scan failed for ${datasourceId}: ${(err as Error).message}`);
    }

    return log;
  }

  private async fetchSampleMetrics(datasourceId: string): Promise<Array<{ name: string; values: number[] }>> {
    // [Fix-1 Task 1.7] 论文创新点 #4：从数据源拉取真实时序数据用于异常检测
    // 替代原来的硬编码假数据, 通过 ExecutorFactory 创建 executor, 对 dashboard.kpis 中的 metric 跑时序聚合
    const ds = await this.db.db
      .selectFrom("DataSource")
      .selectAll()
      .where("id", "=", datasourceId)
      .executeTakeFirst();

    if (!ds) return [];

    const understanding = ds.schemaUnderstanding as Record<string, unknown> | null;
    if (!understanding?.dashboard) return [];

    const dashboard = understanding.dashboard as {
      kpis?: Array<{ table?: string; metric?: string; label?: string }>;
    };
    const kpis = dashboard.kpis ?? [];
    if (kpis.length === 0) return [];

    const config = this.datasourceService.decryptConfigForExecutor(
      ds.connectionConfig as unknown as Parameters<ExecutorFactory["create"]>[1],
    );
    const executor = this.executorFactory.create(datasourceId, config);

    const series: Array<{ name: string; values: number[] }> = [];
    for (const kpi of kpis.slice(0, 5)) {
      if (!kpi.table || !kpi.metric) continue;
      try {
        // 查询最近 30 天的时序聚合
        const timeField = this.findTimeField(understanding, kpi.table);
        if (!timeField) continue;

        // 仅允许安全的 metric 表达式: 数字列名 / SUM(x) / COUNT(*) / AVG(x) / 简单列名
        // 拒绝任何非白名单字符, 防止 SQL 注入
        const safeMetric = /^[A-Za-z_][A-Za-z0-9_]*$/.test(kpi.metric)
          ? `SUM("${kpi.metric}")`
          : /^(SUM|COUNT|AVG|MIN|MAX)\(.+\)$/i.test(kpi.metric)
            ? kpi.metric
            : null;
        if (!safeMetric) {
          this.logger.warn(
            `跳过不安全 metric 表达式: ${kpi.metric}`,
          );
          continue;
        }

        const sql = `SELECT date_trunc('day', "${timeField}") as time, ${safeMetric} as value
                     FROM "${kpi.table}"
                     WHERE "${timeField}" >= NOW() - INTERVAL '30 days'
                     GROUP BY time
                     ORDER BY time`;

        const result = await executor.executeRaw(sql);
        series.push({
          name: kpi.label ?? kpi.metric,
          values: result.rows.map((r) => Number(r.value) || 0),
        });
      } catch (err) {
        this.logger.warn(
          `查询 ${kpi.table}.${kpi.metric} 失败: ${(err as Error).message}`,
        );
      }
    }
    return series;
  }

  /**
   * [Fix-1 Task 1.7] 从 schema understanding 中找到指定表的时间字段
   */
  private findTimeField(
    understanding: Record<string, unknown>,
    tableName: string,
  ): string | null {
    const tables = (understanding.tables as Array<Record<string, unknown>>) ?? [];
    const table = tables.find((t) => t.name === tableName);
    if (!table) return null;
    const fields = (table.columns as Array<Record<string, unknown>>) ?? [];
    const timeField = fields.find((f) => f.semanticRole === "time");
    return (timeField?.name as string | undefined) ?? null;
  }

  private async persistInsight(
    datasourceId: string,
    result: AnomalyResult,
  ): Promise<void> {
    await this.db.db
      .insertInto("Insight")
      .values({
        id: randomUUID(),
        datasourceId,
        type: result.type,
        severity: result.severity,
        title: result.title,
        description: result.description,
        evidence: result.evidence as unknown as Record<string, unknown>,
        suggestion: result.suggestion,
        status: "active",
        detectedAt: new Date(),
      })
      .execute();
  }

  /** 关闭定时任务 (用于测试) */
  onModuleDestroy() {
    this.stop();
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }
}
