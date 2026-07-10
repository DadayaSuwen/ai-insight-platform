import * as jwt from "jsonwebtoken";

/**
 * [Sprint 5] JWT secret 校验 + 签发 / 验证 helper
 *
 * 架构师避坑:JWT_SECRET 必须从 env 注入,缺失或长度不够则 throw,
 * 绝不降级为默认值(否则等于公开密钥)。
 *
 * 与 DB_CONFIG_ENCRYPTION_KEY 类似:启动时校验。
 */

const MIN_SECRET_LEN = 32;
let cachedSecret: string | null = null;

function loadSecret(): string {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      "[jwt-secret] JWT_SECRET not set. Refusing to start without JWT secret — never fall back to a default key.",
    );
  }
  if (raw.length < MIN_SECRET_LEN) {
    throw new Error(
      `[jwt-secret] JWT_SECRET must be at least ${MIN_SECRET_LEN} chars, got ${raw.length}`,
    );
  }
  cachedSecret = raw;
  return raw;
}

/** 测试 helper:重置缓存(env 切换后重读) */
export function resetJwtSecretForTests(): void {
  cachedSecret = null;
}

/**
 * JWT payload 接口(签发 / 验证共用)
 */
export interface JwtPayload {
  sub: string; // userId
  email: string;
  iat?: number;
  exp?: number;
}

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 天

/**
 * 签发 token
 */
export function signJwt(payload: { sub: string; email: string }): string {
  return jwt.sign(payload, loadSecret(), { expiresIn: TOKEN_TTL_SEC });
}

/**
 * 验证 token,抛错表示非法
 */
export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, loadSecret()) as JwtPayload;
}