import { Injectable, Logger } from "@nestjs/common";
import type { MetadataSnapshot } from "@workspace/types";

/**
 * [Sprint 1 / V3] MetadataSnapshot LRU + TTL 缓存
 *
 * 5 分钟 TTL,1000 个 entry 上限,简单 Map 实现(Sprint 2 可换成 LRU 库)。
 *
 * 调用方:PlannerAgent.buildSystemPrompt(dataSourceId),
 *        ChatService.processMessageStream(在 trace log)
 *
 * 缓存键:`dataSourceId`
 * 失效:TTL 到期 OR DatasourceService 显式 invalidate(id)
 */
@Injectable()
export class MetadataCacheService {
  private readonly logger = new Logger(MetadataCacheService.name);

  private cache = new Map<string, { snapshot: MetadataSnapshot; expiresAt: number }>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 min
  private readonly maxEntries = 1000;

  get(dataSourceId: string): MetadataSnapshot | null {
    const entry = this.cache.get(dataSourceId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(dataSourceId);
      return null;
    }
    return entry.snapshot;
  }

  set(dataSourceId: string, snapshot: MetadataSnapshot): void {
    if (this.cache.size >= this.maxEntries) {
      // 简单 FIFO 淘汰(非 LRU,但足够)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(dataSourceId, {
      snapshot,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(dataSourceId: string): void {
    this.cache.delete(dataSourceId);
    this.logger.log(`Invalidated cache for ${dataSourceId}`);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
