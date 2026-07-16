import { parsePgUrl } from "../parse-pg-url";

/**
 * [Sprint 1 / V3] parsePgUrl 单元测试
 *
 * 测 parsePgUrl 的纯逻辑:
 *  - parsePgUrl 接受标准 postgres:// URL
 *  - parsePgUrl 拒绝非 postgres URL(mysql:// etc.)
 *  - parsePgUrl 拒绝非法字符串
 *  - parsePgUrl 默认端口 5432
 */
describe("[Sprint 1 / V3] parsePgUrl (URL 解析)", () => {
  test("标准 URL 正确解析", () => {
    const out = parsePgUrl("postgres://app:secret@localhost:5432/ai_insight");
    expect(out).toEqual({
      host: "localhost",
      port: 5432,
      database: "ai_insight",
      user: "app",
      password: "secret",
    });
  });

  test("postgresql:// 协议也支持", () => {
    const out = parsePgUrl(
      "postgresql://user@db.example.com/mydb",
    );
    expect(out?.host).toBe("db.example.com");
    expect(out?.port).toBe(5432);
    expect(out?.database).toBe("mydb");
    expect(out?.user).toBe("user");
    expect(out?.password).toBeUndefined();
  });

  test("缺端口 → 默认 5432", () => {
    const out = parsePgUrl("postgres://u@localhost/db");
    expect(out?.port).toBe(5432);
  });

  test("URL-encoded 密码正确解码", () => {
    // 'p@ss/word!' → p@ss/word!
    const out = parsePgUrl(
      "postgres://u:p%40ss%2Fword%21@localhost:5432/db",
    );
    expect(out?.password).toBe("p@ss/word!");
  });

  test("非 postgres URL → null", () => {
    expect(parsePgUrl("mysql://root@localhost/db")).toBeNull();
    expect(parsePgUrl("mongodb://localhost/db")).toBeNull();
    expect(parsePgUrl("http://localhost")).toBeNull();
  });

  test("非法 URL → null", () => {
    expect(parsePgUrl("")).toBeNull();
    expect(parsePgUrl("not a url")).toBeNull();
    expect(parsePgUrl("postgres://")).toBeNull(); // 缺 database
  });

  test("Result 可直接构造 ConnectionConfig", () => {
    const parsed = parsePgUrl(
      "postgres://app:password@localhost:5432/ai_insight",
    );
    expect(parsed).toBeTruthy();

    // 构造 connectionConfig shape
    const cfg = {
      type: "postgres" as const,
      host: parsed!.host,
      port: parsed!.port,
      database: parsed!.database,
      user: parsed!.user,
      password: parsed!.password,
      ssl: false,
      schema: "public",
    };
    expect(cfg.type).toBe("postgres");
    expect(cfg.schema).toBe("public");
    expect(cfg.ssl).toBe(false);
  });
});
