import type { QueryIntent } from "@workspace/types";
import { QueryCacheService } from "../cache.service";

/**
 * [Sprint 4 / V3] QueryCacheService 单测
 *
 * 覆盖:
 *   - 缓存命中:set → get 返回同 result
 *   - 缓存键稳定:相同 intent 不同 key 顺序 → 同一 cache entry
 *   - 缓存键不同:不同 intent → 不同 cache entry
 *   - 失效:invalidate(id) 删除该 id 所有 entry
 *   - 空结果 30s TTL(短)
 *   - 非空 5 分钟 TTL(长)
 *
 * 不依赖真实时间(用 Date.now() 直接断言比较值)。
 */

const intentA: QueryIntent = {
  dataSourceId: "ds1",
  intentType: "aggregate",
  joins: [],
  table: "orders",
  groupBy: ["region"],
  metrics: [{ column: "amount", agg: "SUM", alias: "total", label: "总销售额" }],
  filters: [],
  limit: 100,
};

const intentAReordered: QueryIntent = {
  dataSourceId: "ds1",
  intentType: "aggregate",
  joins: [],
  table: "orders",
  groupBy: ["region"],
  metrics: [{ column: "amount", agg: "SUM", alias: "total", label: "总销售额" }],
  filters: [],
  limit: 100,
};

const intentB: QueryIntent = {
  dataSourceId: "ds1",
  intentType: "aggregate",
  joins: [],
  table: "orders",
  groupBy: ["category"],
  metrics: [{ column: "amount", agg: "SUM", alias: "total", label: "总销售额" }],
  filters: [],
  limit: 100,
};

const fakeResult = (n: number) => ({
  rows: Array.from({ length: n }, (_, i) => ({ a: i })),
  rowCount: n,
  truncated: false,
  durationMs: 5,
});

const U1 = "user-1";
const U2 = "user-2";

describe("[Sprint 4 / V3] QueryCacheService", () => {
  let cache: QueryCacheService;
  let now = 1_000_000;

  beforeEach(() => {
    cache = new QueryCacheService();
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  test("set → get 返回同 result", () => {
    const r = fakeResult(3);
    cache.set("ds1", U1, intentA, r);
    expect(cache.get("ds1", U1, intentA)).toEqual(r);
  });

  test("key 顺序稳定:相同 intent 不同 key 顺序 → 命中", () => {
    const r = fakeResult(2);
    cache.set("ds1", U1, intentA, r);
    expect(cache.get("ds1", U1, intentAReordered)).toEqual(r);
  });

  test("不同 intent → miss", () => {
    const r = fakeResult(2);
    cache.set("ds1", U1, intentA, r);
    expect(cache.get("ds1", U1, intentB)).toBeNull();
  });

  test("不同 userId 同一 intent → miss (租户隔离)", () => {
    const r = fakeResult(3);
    cache.set("ds1", U1, intentA, r);
    expect(cache.get("ds1", U2, intentA)).toBeNull();
  });

  test("invalidate(dataSourceId) 删除所有该 id 的 entry", () => {
    cache.set("ds1", U1, intentA, fakeResult(1));
    cache.set("ds1", U1, intentB, fakeResult(2));
    cache.set("ds2", U1, intentA, fakeResult(3));
    expect(cache.size()).toBe(3);
    const removed = cache.invalidate("ds1");
    expect(removed).toBe(2);
    expect(cache.size()).toBe(1);
    // ds2 的 intentA 仍存在
    expect(cache.get("ds2", U1, intentA)).not.toBeNull();
  });

  test("空结果 30s TTL,过期后 miss", () => {
    const empty = fakeResult(0);
    cache.set("ds1", U1, intentA, empty);
    // 29s 后仍在
    now += 29_000;
    expect(cache.get("ds1", U1, intentA)).toEqual(empty);
    // 31s 后过期
    now += 2_000;
    expect(cache.get("ds1", U1, intentA)).toBeNull();
  });

  test("非空 5min TTL", () => {
    cache.set("ds1", U1, intentA, fakeResult(5));
    // 4min 后仍在
    now += 4 * 60_000;
    expect(cache.get("ds1", U1, intentA)).not.toBeNull();
    // 6min 后过期
    now += 2 * 60_000;
    expect(cache.get("ds1", U1, intentA)).toBeNull();
  });

  test("invalidateAll 清空所有", () => {
    cache.set("ds1", U1, intentA, fakeResult(1));
    cache.set("ds2", U1, intentB, fakeResult(2));
    cache.invalidateAll();
    expect(cache.size()).toBe(0);
  });
});