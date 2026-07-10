import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DuckDbExecutor } from "../duckdb.executor";

/**
 * [Sprint 4] DuckDbExecutor 列覆写 + TRY_CAST 单测
 *
 * 验证:
 *   - columnOverrides(用户重命名 + 类型覆盖)正确反映在 DuckDB VIEW
 *   - TRY_CAST 把全文字列强转 DECIMAL 时失败值变 NULL,不抛错
 *   - 列名 slug 化与原始 label 双向映射
 */

function writeTempCsv(content: string): { path: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "duck-s4-test-"));
  const file = path.join(dir, "data.csv");
  fs.writeFileSync(file, content, "utf8");
  return {
    path: file,
    cleanup: () => {
      // setImmediate 推迟 unlink 防 EBUSY
      setImmediate(() => {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // swallow
        }
      });
    },
  };
}

describe("[Sprint 4 / V3] DuckDbExecutor 列覆写 + TRY_CAST", () => {
  test("columnOverrides 把原列重命名为新名,query 按新名查", async () => {
    const tmp = writeTempCsv(
      "name,age\nAlice,30\nBob,25\nCharlie,40\n",
    );
    try {
      const exec = new DuckDbExecutor("ds1", {
        type: "duckdb-csv",
        filePath: tmp.path,
        tableAlias: "data",
        columnOverrides: [
          { originalName: "name", newName: "employee_name", type: "AUTO" },
          { originalName: "age", newName: "employee_age", type: "AUTO" },
        ],
      });
      const snap = await exec.introspect();
      const cols = snap.tables[0].columns.map(c => c.name);
      expect(cols).toContain("employee_name");
      expect(cols).toContain("employee_age");
      expect(cols).not.toContain("name");

      const result = await exec.executeRaw(
        'SELECT "employee_name", "employee_age" FROM data ORDER BY "employee_age" DESC LIMIT 10',
      );
      // DuckDB 推断 INTEGER → number;VARCHAR → string
      expect(result.rows[0]).toEqual({ employee_name: "Charlie", employee_age: 40 });
      expect(result.rows.length).toBe(3);
      await exec.dispose();
    } finally {
      tmp.cleanup();
    }
  }, 15000);

  test("TRY_CAST:用户把全文字列强转 DECIMAL,失败值变 NULL 不崩", async () => {
    const tmp = writeTempCsv(
      "name,amount\nAlice,123\nBob,一百元\nCharlie,456\n",
    );
    try {
      const exec = new DuckDbExecutor("ds2", {
        type: "duckdb-csv",
        filePath: tmp.path,
        tableAlias: "data",
        columnOverrides: [
          { originalName: "name", newName: "name", type: "AUTO" },
          // 用户强行把脏数列标为 DECIMAL — TRY_CAST 让 "一百元" → NULL
          { originalName: "amount", newName: "amount_num", type: "DECIMAL" },
        ],
      });
      const result = await exec.executeRaw(
        'SELECT "name", "amount_num" FROM data ORDER BY "name"',
      );
      // TRY_CAST 成功 → number;失败 → 空字符串 (normalizeRow 把 null 转 "")
      expect(result.rows).toEqual([
        { name: "Alice", amount_num: 123 },
        { name: "Bob", amount_num: "" }, // TRY_CAST 失败 → NULL → 空字符串
        { name: "Charlie", amount_num: 456 },
      ]);
      await exec.dispose();
    } finally {
      tmp.cleanup();
    }
  }, 15000);

  test("无 columnOverrides 时维持默认行为(向后兼容)", async () => {
    const tmp = writeTempCsv("x,y\n1,a\n2,b\n");
    try {
      const exec = new DuckDbExecutor("ds3", {
        type: "duckdb-csv",
        filePath: tmp.path,
        tableAlias: "data",
      });
      const snap = await exec.introspect();
      const cols = snap.tables[0].columns.map(c => c.name);
      expect(cols).toEqual(["x", "y"]);
      const result = await exec.executeRaw('SELECT "x", "y" FROM data LIMIT 10');
      expect(result.rows.length).toBe(2);
      await exec.dispose();
    } finally {
      tmp.cleanup();
    }
  }, 15000);
});