import { ExecutorFactory } from "../executor.factory";
import type { ConnectionConfig } from "@workspace/types";

/**
 * [Sprint 5] ExecutorFactory 连接池复用 单测
 *
 * 覆盖:
 *   - 同一 id 两次 create → 复用同一 executor(不会调两次构造)
 *   - evict 后再 create → 重建
 *   - 多 id 互不干扰
 *   - OnModuleDestroy 全部 dispose
 *
 * 注:本测试不需要真实 DB 连接,用 duckdb-csv 临时文件做最小验证。
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("[Sprint 5 / V3] ExecutorFactory 连接池复用", () => {
  let tmpDir: string;
  let csvPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-factory-"));
    csvPath = path.join(tmpDir, "x.csv");
    fs.writeFileSync(csvPath, "a,b\n1,2\n3,4\n");
  });

  afterAll(() => {
    setImmediate(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });
  });

  test("同一 id 两次 create 返回同一 executor 实例", () => {
    const factory = new ExecutorFactory();
    const cfg: ConnectionConfig = {
      type: "duckdb-csv",
      filePath: csvPath,
      tableAlias: "data",
    };
    const e1 = factory.create("ds-pool-1", cfg);
    const e2 = factory.create("ds-pool-1", cfg);
    expect(e1).toBe(e2); // identity — 同一对象
    expect(factory.size()).toBe(1);
  });

  test("不同 id → 不同 executor", () => {
    const factory = new ExecutorFactory();
    const cfg: ConnectionConfig = {
      type: "duckdb-csv",
      filePath: csvPath,
      tableAlias: "data",
    };
    factory.create("ds-a", cfg);
    factory.create("ds-b", cfg);
    expect(factory.size()).toBe(2);
    expect(factory.ids()).toContain("ds-a");
    expect(factory.ids()).toContain("ds-b");
  });

  test("evict(id) → 删除 pool entry,再 create() 重建", async () => {
    const factory = new ExecutorFactory();
    const cfg: ConnectionConfig = {
      type: "duckdb-csv",
      filePath: csvPath,
      tableAlias: "data",
    };
    const e1 = factory.create("ds-evict", cfg);
    expect(factory.size()).toBe(1);
    await factory.evict("ds-evict");
    expect(factory.size()).toBe(0);
    const e2 = factory.create("ds-evict", cfg);
    expect(e2).not.toBe(e1); // 重建 — 新实例
  });

  test("OnModuleDestroy 全部 dispose", async () => {
    const factory = new ExecutorFactory();
    const cfg: ConnectionConfig = {
      type: "duckdb-csv",
      filePath: csvPath,
      tableAlias: "data",
    };
    factory.create("ds-x", cfg);
    factory.create("ds-y", cfg);
    expect(factory.size()).toBe(2);
    await factory.onModuleDestroy();
    expect(factory.size()).toBe(0);
  });

  test("evict 不存在的 id → false,size 不变", async () => {
    const factory = new ExecutorFactory();
    const removed = await factory.evict("nonexistent");
    expect(removed).toBe(false);
    expect(factory.size()).toBe(0);
  });

  test("[Sprint 5 集成] 连续 50 次 create 同一 id,实际只创建 1 次(池复用)", async () => {
    const factory = new ExecutorFactory();
    const cfg: ConnectionConfig = {
      type: "duckdb-csv",
      filePath: csvPath,
      tableAlias: "data",
    };
    const e1 = factory.create("ds-burst", cfg);
    for (let i = 0; i < 50; i++) {
      const e = factory.create("ds-burst", cfg);
      expect(e).toBe(e1); // identity — 始终是同一 executor
    }
    expect(factory.size()).toBe(1); // 池中只有一条
  });
});