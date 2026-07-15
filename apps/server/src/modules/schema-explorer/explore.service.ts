import { Injectable, Logger } from "@nestjs/common";
import { DatasourceService } from "../datasource/datasource.service";
import { MetadataService } from "../datasource/metadata/metadata.service";
import { SemanticInferenceService } from "../datasource/metadata/semantic-inference.service";
import { ExecutorFactory } from "../datasource/executors/executor.factory";
import { DatabaseService } from "../database/database.service";
import type { ConnectionConfig } from "@workspace/types";

/**
 * [Sprint 6] SchemaExplorerService — 编排 5 步自主探索
 *
 * SSE 事件格式 (兼容 ChatController 的 SSE 通道):
 *   event: step
 *   data: {"step":1, "name":"connecting", "status":"done", "detail":"已连接"}
 *
 *   event: step
 *   data: {"step":2, "name":"discover_tables", "status":"active", "detail":"发现 8 张表"}
 *
 *   event: done
 *   data: {"review_needed":true, "pending_fields":4}
 */

export interface ExploreStepEvent {
  step: number;
  name: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
  elapsedMs?: number;
}

export interface ExploreDoneEvent {
  reviewNeeded: boolean;
  pendingFields: number;
  totalFields: number;
  totalTables: number;
}

const STEP_NAMES = [
  "connecting",
  "discover_tables",
  "analyze_fields",
  "infer_relations",
  "generate_report",
] as const;

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);

  constructor(
    private readonly ds: DatasourceService,
    private readonly meta: MetadataService,
    private readonly semanticInference: SemanticInferenceService,
    private readonly factory: ExecutorFactory,
    private readonly db: DatabaseService,
  ) {}

  /**
   * 异步生成器:逐步 yield SSE 事件
   */
  async *explore(
    dataSourceId: string,
    userId: string,
  ): AsyncGenerator<
    | { type: "step"; data: ExploreStepEvent }
    | { type: "done"; data: ExploreDoneEvent }
    | { type: "error"; data: { message: string } }
    // [Fix-6 Task 6.1] 细粒度 progress 事件 — 前端用 time-line 渲染
    | { type: "progress"; data: { step: number; type: string; data: Record<string, unknown>; timestamp: string } }
  > {
    const startedAt = Date.now();
    let totalFields = 0;
    let pendingFields = 0;

    // ── Step 1: 连接数据源 ─────────────────────────────────
    yield this.stepEvent(1, "connecting", "active", "正在连接数据源...");

    try {
      const record = await this.ds.getByIdForUser(dataSourceId, userId);
      if (!record) {
        yield this.stepEvent(1, "connecting", "error", "数据源不存在");
        return;
      }

      // 更新探索状态
      await this.db.db
        .updateTable("DataSource")
        .set({ exploreStatus: "exploring" })
        .where("id", "=", dataSourceId)
        .execute();

      const decrypted = this.ds.decryptConfigForExecutor(
        record.connectionConfig as unknown as Parameters<ExecutorFactory["create"]>[1],
      );
      const executor = this.factory.create(dataSourceId, decrypted);
      const health = await executor.healthCheck();

      if (!health.ok) {
        yield this.stepEvent(1, "connecting", "error", health.error ?? "连接失败");
        return;
      }

      yield this.stepEvent(1, "connecting", "done", `已连接 · ${health.latencyMs}ms`, Date.now() - startedAt);
    } catch (err) {
      yield this.stepEvent(1, "connecting", "error", (err as Error).message);
      return;
    }

    // ── Step 2: 发现表与统计 ───────────────────────────────
    yield this.stepEvent(2, "discover_tables", "active", "正在内省数据库结构...");
    const t0 = Date.now();

    try {
      const snapshot = await this.meta.get(dataSourceId, { refresh: true });
      const tables = snapshot.tables;
      totalFields = tables.reduce((sum, t) => sum + t.columns.length, 0);

      // [Fix-6 Task 6.1] 逐表推送 progress 事件, 前端可滚出每张表
      for (const table of tables) {
        yield this.sseEvent(2, "table_discovered", {
          name: table.name,
          rowCount: table.rowCount ?? 0,
          columnCount: table.columns.length,
          size: 0,
        });
      }

      const tableSummary = tables
        .map((t) => `${t.name} (${t.columns.length} 列)`)
        .join(", ");

      yield this.stepEvent(
        2,
        "discover_tables",
        "done",
        `发现 ${tables.length} 张表 · ${totalFields} 个字段: ${tableSummary}`,
        Date.now() - t0,
      );
    } catch (err) {
      yield this.stepEvent(2, "discover_tables", "error", (err as Error).message);
      return;
    }

    // ── Step 3: 分析字段语义 ───────────────────────────────
    yield this.stepEvent(3, "analyze_fields", "active", "LLM 正在推断字段语义...");
    const t1 = Date.now();

    try {
      const snapshot = await this.meta.get(dataSourceId);
      const lowConfFields: string[] = [];

      for (const table of snapshot.tables) {
        for (const col of table.columns) {
          // 论文创新点 #1：基于 LLM 置信度门控判定是否需要用户确认
          // 替代原来的 "chineseName !== name" 布尔启发式, 调 SemanticInferenceService.computeConfidence
          const confidence = this.semanticInference.computeConfidence(col);
          const isAutoConfirmed = confidence >= SemanticInferenceService.CONFIDENCE_THRESHOLD;

          if (!isAutoConfirmed) {
            pendingFields++;
            lowConfFields.push(`${table.name}.${col.name} (置信度 ${confidence.toFixed(2)})`);
          }

          // [Fix-6 Task 6.1] 逐字段推送 progress 事件 (前端逐行渲染)
          yield this.sseEvent(3, "field_analyzed", {
            table: table.name,
            field: col.name,
            type: col.rawType,
            inferredMeaning: col.chineseName || col.name,
            role: col.semanticRole || "unknown",
            confidence: parseFloat(confidence.toFixed(2)),
            needsConfirmation: !isAutoConfirmed,
            status: isAutoConfirmed ? "confirmed" : "pending",
          });
        }
      }

      const detail =
        pendingFields > 0
          ? `已确认 ${totalFields - pendingFields} 个字段 · ${pendingFields} 个字段待确认: ${lowConfFields.slice(0, 5).join(", ")}${lowConfFields.length > 5 ? "..." : ""}`
          : `全部 ${totalFields} 个字段已自动确认`;

      yield this.stepEvent(3, "analyze_fields", "done", detail, Date.now() - t1);
    } catch (err) {
      yield this.stepEvent(3, "analyze_fields", "error", (err as Error).message);
      return;
    }

    // ── Step 4: 推断表关系 ─────────────────────────────────
    yield this.stepEvent(4, "infer_relations", "active", "正在推断表间关系...");
    const t2 = Date.now();

    try {
      const snapshot = await this.meta.get(dataSourceId);
      const relations = this.inferRelations(snapshot.tables.map((t) => ({
        name: t.name,
        columns: t.columns.map((c) => c.name),
      })));

      // [Fix-6 Task 6.1] 逐关系推送 progress 事件 (前端逐条显示)
      for (const rel of relations) {
        // rel.from = "table.field" → 拆 fromTable / fromField
        const [fromTable, fromField] = rel.from.split(".");
        yield this.sseEvent(4, "relation_inferred", {
          fromTable: fromTable ?? rel.from,
          fromField: fromField ?? "",
          toTable: rel.to,
          toField: "id",
          confidence: rel.confidence,
        });
      }

      yield this.stepEvent(
        4,
        "infer_relations",
        "done",
        `发现 ${relations.length} 条潜在表关系`,
        Date.now() - t2,
      );
    } catch (err) {
      yield this.stepEvent(4, "infer_relations", "done", "跳过 (表关系将在纠错阶段确认)", Date.now() - t2);
    }

    // ── Step 5: 生成 Schema 理解报告 ───────────────────────
    yield this.stepEvent(5, "generate_report", "active", "正在生成 Schema 理解报告...");
    const t3 = Date.now();

    try {
      // 更新 DataSource 状态
      await this.db.db
        .updateTable("DataSource")
        .set({ exploreStatus: pendingFields > 0 ? "reviewing" : "finalized" })
        .where("id", "=", dataSourceId)
        .execute();

      yield this.stepEvent(
        5,
        "generate_report",
        "done",
        pendingFields > 0 ? `需要确认 ${pendingFields} 个字段` : "所有字段已确认，可生成工作台",
        Date.now() - t3,
      );
    } catch (err) {
      yield this.stepEvent(5, "generate_report", "error", (err as Error).message);
      return;
    }

    // ── done ──────────────────────────────────────────────
    yield {
      type: "done",
      data: {
        reviewNeeded: pendingFields > 0,
        pendingFields,
        totalFields,
        totalTables: (await this.meta.get(dataSourceId)).tables.length,
      },
    };

    this.logger.log(
      `Explore complete for ${dataSourceId}: ${totalFields} fields, ${pendingFields} pending`,
    );
  }

  /* ───────── helpers ───────── */

  private stepEvent(
    step: number,
    name: string,
    status: ExploreStepEvent["status"],
    detail: string,
    elapsedMs?: number,
  ): { type: "step"; data: ExploreStepEvent } {
    return {
      type: "step",
      data: { step, name, status, detail, elapsedMs },
    };
  }

  /**
   * [Fix-6 Task 6.1] 细粒度 sseEvent 进度事件 — 前端用 time-line 渲染
   */
  private sseEvent(
    step: number,
    type: "table_discovered" | "field_analyzed" | "relation_inferred",
    data: Record<string, unknown>,
  ): { type: "progress"; data: { step: number; type: string; data: Record<string, unknown>; timestamp: string } } {
    return {
      type: "progress",
      data: { step, type, data, timestamp: new Date().toISOString() },
    };
  }

  /**
   * 基于命名相似性推断表关系 (轻量级, 不调 LLM)
   */
  private inferRelations(
    tables: Array<{ name: string; columns: string[] }>,
  ): Array<{ from: string; to: string; confidence: number }> {
    const relations: Array<{ from: string; to: string; confidence: number }> = [];

    for (const t1 of tables) {
      for (const c1 of t1.columns) {
        // 匹配模式: xxx_id → 另一张表的 id
        if (c1.endsWith("_id") || c1.endsWith("_ID")) {
          const base = c1.replace(/_id$/i, "");
          // 看是否有名为 base + "s" 或 base 的表
          for (const t2 of tables) {
            if (t2.name === base || t2.name === `${base}s` || t2.name === `${base}es`) {
              relations.push({ from: `${t1.name}.${c1}`, to: t2.name, confidence: 0.8 });
            }
          }
        }
      }
    }

    return relations;
  }
}
