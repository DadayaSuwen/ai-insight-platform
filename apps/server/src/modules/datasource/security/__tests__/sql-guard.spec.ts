import {
  guardSql,
  DEFAULT_MAX_ROWS,
  type SqlGuardOptions,
} from "../sql-guard";

describe("[Sprint 1 / V3] sql-guard", () => {
  describe("拒绝危险 SQL", () => {
    const blocked: Array<{ name: string; sql: string; expectedFragment: RegExp }> = [
      {
        name: "DROP TABLE",
        sql: "DROP TABLE users",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "INSERT INTO",
        sql: "INSERT INTO x VALUES (1)",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "UPDATE",
        sql: "UPDATE users SET name='x'",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "DELETE FROM",
        sql: "DELETE FROM users",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "ALTER TABLE",
        sql: "ALTER TABLE users ADD COLUMN x INT",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "TRUNCATE",
        sql: "TRUNCATE users",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "MERGE INTO (Postgres UPSERT 变种)",
        sql: "MERGE INTO users USING ... ON ...",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "CREATE TABLE",
        sql: "CREATE TABLE x (id INT)",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "GRANT",
        sql: "GRANT SELECT ON x TO public",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "REINDEX",
        sql: "REINDEX TABLE x",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "大小写混合 (CrEaTe)",
        sql: "CrEaTe table x (id int)",
        expectedFragment: /Forbidden/i,
      },
      {
        name: "包含 schema-qualified identifier",
        sql: "SELECT 1; DROP TABLE x",
        // 黑名单先于多语句拦截命中 — 拒绝即可
        expectedFragment: /Forbidden/i,
      },
      {
        name: "末尾 -- 注释绕过",
        sql: "SELECT 1 -- innocent comment",
        expectedFragment: /comment/i,
      },
      {
        name: "-- 注释后接 INSERT",
        sql: "SELECT 1 FROM x; -- fun\nINSERT INTO y VALUES(1)",
        // 黑名单(INSERT)先于注释拦截命中 — 拒绝即可
        expectedFragment: /Forbidden/i,
      },
    ];

    test.each(blocked)("$name → 拒绝", ({ sql, expectedFragment }) => {
      const result = guardSql(sql);
      expect(result.rejected).toBe(true);
      expect(result.reason).toBeDefined();
      expect(result.reason).toMatch(expectedFragment);
    });
  });

  describe("接受合法 SELECT", () => {
    test("简单 SELECT 无 LIMIT → 强制包裹 LIMIT 1000", () => {
      const result = guardSql("SELECT * FROM users");
      expect(result.rejected).toBe(false);
      expect(result.modified).toBe(true);
      expect(result.sql).toBe(`SELECT * FROM users LIMIT ${DEFAULT_MAX_ROWS}`);
    });

    test("带 LIMIT 子句 → 不再追加", () => {
      const result = guardSql("SELECT id FROM users LIMIT 10");
      expect(result.rejected).toBe(false);
      expect(result.modified).toBe(false);
      expect(result.sql).toBe("SELECT id FROM users LIMIT 10");
    });

    test("带尾部 `;` + 空白 → 仍然补 LIMIT", () => {
      const result = guardSql("SELECT id FROM users;  \n");
      expect(result.rejected).toBe(false);
      expect(result.sql).toBe(`SELECT id FROM users LIMIT ${DEFAULT_MAX_ROWS}`);
    });

    test("尾随 `LIMIT 1000` 不重复", () => {
      const result = guardSql("SELECT id FROM users LIMIT 1000;");
      expect(result.rejected).toBe(false);
      expect(result.modified).toBe(false);
    });

    test("FETCH FIRST (Oracle/SQL 标准) 视为已有限制", () => {
      const result = guardSql("SELECT id FROM users FETCH FIRST 50 ROWS ONLY");
      expect(result.rejected).toBe(false);
      expect(result.modified).toBe(false);
    });

    test("skipLimit: true 时不包裹", () => {
      const opts: SqlGuardOptions = { skipLimit: true };
      const result = guardSql("SELECT * FROM users", opts);
      expect(result.rejected).toBe(false);
      expect(result.modified).toBe(false);
      expect(result.sql).toBe("SELECT * FROM users");
    });

    test("自定义 maxRows", () => {
      const result = guardSql("SELECT * FROM x", { maxRows: 5 });
      expect(result.sql).toBe("SELECT * FROM x LIMIT 5");
    });
  });

  describe("边界 case", () => {
    test("空字符串 → 拒绝", () => {
      const result = guardSql("");
      expect(result.rejected).toBe(true);
      expect(result.reason).toMatch(/non-empty/i);
    });

    test("纯空白 → 拒绝", () => {
      const result = guardSql("   \n\t  ");
      expect(result.rejected).toBe(true);
    });

    test("完全无 whitespace 的 DROP 由于 \\b 锚定无法绕过", () => {
      // \bDROP\b 仍会匹配即使没有空格;但 "DROP_" 形式不应匹配。
      // 测试 "DROP_TABLE_myhack" 是否能绕过 — \b 锚定要求 word boundary,
      // 下划线 _ 在 JS regex 中是 \w 字符,不构成边界。
      const result = guardSql("SELECT * FROM DROP_TABLE_myhack");
      expect(result.rejected).toBe(false);
    });

    test("嵌套 SELECT 仍受 LIMIT 包裹", () => {
      const result = guardSql(
        "SELECT id FROM (SELECT id FROM users) sub",
      );
      expect(result.rejected).toBe(false);
      expect(result.modified).toBe(true);
      expect(result.sql).toMatch(/LIMIT 1000$/);
    });
  });
});
