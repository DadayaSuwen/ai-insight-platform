/**
 * 简单 URL 解析 — 不引入 pg-connection-string 依赖。
 *
 * 把 postgres:// URL 解析成 ConnectionConfig(postgres)字段。
 * Sprint 1 测试此函数的纯逻辑。
 */
export interface ParsedPgUrl {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string | undefined;
}

export function parsePgUrl(url: string): ParsedPgUrl | null {
  try {
    const u = new URL(url);
    if (!u.protocol.startsWith("postgres")) return null;
    const database = u.pathname.replace(/^\//, "");
    if (!database) return null;
    return {
      host: u.hostname || "localhost",
      port: u.port ? Number(u.port) : 5432,
      database,
      user: decodeURIComponent(u.username || "postgres"),
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return null;
  }
}
