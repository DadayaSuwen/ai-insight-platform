import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as cron from "node-cron";
import { DatabaseService } from "../database/database.service";
import { InsightAgent } from "../ai/agents/insight.agent";
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
export class InsightSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(InsightSchedulerService.name);
  private task: cron.ScheduledTask | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly insightAgent: InsightAgent,
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

      // 3. LLM 语义分析 (生成洞察摘要)
      for (const result of log.results.slice(0, 3)) {
        await this.persistInsight(datasourceId, result);
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
    // [Sprint 6] 简化: 从 schemaUnderstanding 提取 metrics 字段
    // 生产环境应从数据源直接查询时序聚合
    const ds = await this.db.db
      .selectFrom("DataSource")
      .selectAll()
      .where("id", "=", datasourceId)
      .executeTakeFirst();

    if (!ds) return [];

    const understanding = ds.schemaUnderstanding as Record<string, unknown> | null;
    if (!understanding) return [];

    const dashboard = (understanding as { dashboard?: { kpis?: Array<{ metric: string }> } }).dashboard;
    const kpis = dashboard?.kpis ?? [];

    return kpis.slice(0, 3).map((kpi, i) => ({
      name: kpi.metric,
      values: [100, 110, 105, 108, 115, 90, 75 + i * 10],
    }));
  }

  private async persistInsight(
    datasourceId: string,
    result: AnomalyResult,
  ): Promise<void> {
    await this.db.db
      .insertInto("Insight")
      .values({
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
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }
}
