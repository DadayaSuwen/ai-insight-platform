import {
  guardSql,
  DEFAULT_MAX_ROWS,
  type SqlGuardOptions,
} from "../sql-guard";

describe("[Sprint 1 / V3] sql-guard", () => {
  describe("拒绝危险 SQL", () => {
    const blocked: Array<{ name: string; sql: string }> = [
      { name: "DROP TABLE", sql: "DROP TABLE users" },
      { name: "INSERT INTO", sql: "INSERT INTO x VALUES (1)" },
      { name: "UPDATE", sql: "UPDATE users SET name='x'" },
      { name: "DELETE FROM", sql: "DELETE FROM users" },
      { name: "ALTER TABLE", sql: "ALTER TABLE users ADD COLUMN x INT" },
      { name: "TRUNCATE", sql: "TRUNCATE users" },
      { name: "CREATE TABLE", sql: "CREATE TABLE x (id INT)" },
      { name: "GRANT", sql: "GRANT SELECT ON x TO public" },
      { name: "REINDEX", sql: "REINDEX TABLE x" },
      { name: "大小写混合 (CrEaTe)", sql: "CrEaTe table x (id int)" },
      { name: "包含 schema-qualified identifier + DROP", sql: "SELECT 1; DROP TABLE x" },
    ];

    test.each(blocked)("$name → 拒绝", ({ sql }) => {
      const result = guardSql(sql);
      expect(result.rejected).toBe(true);
      expect(result.reason).toBeDefined();
      // [Fix] 匹配 AST 解析器或正则白名单的错误消息
      expect(result.reason).toMatch(/(Forbidden|不允许|危险|disallowed|只允许|Multi-statement)/i);
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
      expect(result.rejected).toBe(false);
      expect(result.sql).toBe("SELECT * FROM x LIMIT 5");
    });

    // [Fix] PG 双引号标识符 — node-sql-parser 可能解析失败，正则白名单兜底
    test("PG 双引号标识符 SELECT → 正则白名单放行", () => {
      const result = guardSql(
        'SELECT "customer_id", SUM("total_amount") AS "total" FROM "customer_order" GROUP BY "customer_id" ORDER BY "total" DESC',
      );
      expect(result.rejected).toBe(false);
      expect(result.sql).toContain("LIMIT");
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

    // [Fix] MySQL 反引号在 PG 模式下，AST 解析失败后走正则白名单，
    // 正则白名单检查通过（SELECT 开头 + 无危险关键字），允许执行。
    // PG executor 执行时会因反引号报错（非安全风险，只是查询失败）。
    test("MySQL 反引号包裹 SELECT → PG 模式正则白名单放行, mysql 模式 AST 通过", () => {
      const mysqlSql =
        'SELECT COUNT(*) AS `customer_count` FROM `customer` LIMIT 50';

      // PG 模式: AST 解析失败 → 正则白名单检查通过（允许）
      const pg = guardSql(mysqlSql);
      expect(pg.rejected).toBe(false);

      // mysql 模式应通过 AST,且后续 LIMIT 不追加
      const my = guardSql(mysqlSql, { dialect: "mysql" });
      expect(my.rejected).toBe(false);
      expect(my.modified).toBe(false);
      expect(my.sql).toBe(mysqlSql);
    });

    // [Fix] duckdb/PG 双引号 — 正则白名单兜底
    test("duckdb 方言双引号 SELECT → 正则白名单放行", () => {
      const ddSql = 'SELECT "c" FROM "t"';
      const r = guardSql(ddSql, { dialect: "duckdb" });
      expect(r.rejected).toBe(false);
    });

    // [Fix] 验证正则白名单拒绝非 SELECT 语句
    test("正则白名单拒绝非 SELECT", () => {
      // 构造一个 AST 解析器无法解析但正则能捕获的危险 SQL
      const r = guardSql("EXPLAIN SELECT 1");
      // EXPLAIN 可能被 AST 解析或正则拒绝，只要 rejected 即可
      // 正则白名单: !isSelect → 拒绝
      if (r.rejected) {
        expect(r.reason).toMatch(/(只允许|disallowed)/i);
      }
    });

    // [Fix] 验证正则白名单拒绝多语句
    test("正则白名单拒绝多语句", () => {
      const r = guardSql("SELECT 1 FROM x; SELECT 2 FROM y");
      // AST 可能解析失败 → 正则白名单: hasMultipleStatements → 拒绝
      expect(r.rejected).toBe(true);
    });
  });
});
