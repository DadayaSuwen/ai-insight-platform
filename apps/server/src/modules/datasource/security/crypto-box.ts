import * as crypto from "node:crypto";

/**
 * [Sprint 4 / V3] DB 连接配置加密 (AES-256-GCM)
 *
 * 架构师避坑 #2:DB_CONFIG_ENCRYPTION_KEY 没设时直接 throw,绝不降级。
 *
 * 算法:AES-256-GCM(认证加密,防篡改)
 *   - 密钥长度:32 字节(256 bit)
 *   - IV 长度:12 字节(GCM 推荐)
 *   - AuthTag:16 字节
 *   - 存储格式(IV || ciphertext || authTag),base64 编码后入 JSONB
 *
 * 格式约定:
 *   encrypt(plain) → string(base64(IV(12) + ciphertext + authTag(16)))
 *   decrypt(enc)   → string(plain)
 *
 * 测试用例(env 注入 32 字节 base64 密钥):
 *   process.env.DB_CONFIG_ENCRYPTION_KEY = base64(32 bytes)
 *
 * 性能:典型 100 字节 password 加密 ~30μs,解密同样量级;
 *      配置加载路径只发生 1 次,无热点。
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;

/** 启动时校验 + 缓存 key;缺失则 throw */
let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.DB_CONFIG_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "[crypto-box] DB_CONFIG_ENCRYPTION_KEY not set. " +
        "Refusing to start without encryption key — plaintext storage is not allowed.",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch (err) {
    throw new Error(
      `[crypto-box] DB_CONFIG_ENCRYPTION_KEY is not valid base64: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (key.length !== KEY_LEN) {
    throw new Error(
      `[crypto-box] DB_CONFIG_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes, got ${key.length}`,
    );
  }
  cachedKey = key;
  return key;
}

/**
 * 重置缓存(测试用:setEnv → next call reloads)
 */
export function resetCryptoBoxForTests(): void {
  cachedKey = null;
}

/**
 * 加密字符串 → base64(IV + ciphertext + authTag)
 * @throws 当 DB_CONFIG_ENCRYPTION_KEY 未设置或长度错
 */
export function encryptString(plain: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * 解密 base64(IV + ciphertext + authTag) → 明文
 * @throws 篡改 / 密钥错 / 长度错
 */
export function decryptString(b64: string): string {
  const key = loadKey();
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error(
      `[crypto-box] Encrypted payload too short (${buf.length} bytes)`,
    );
  }
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/**
 * 加密一个对象(仅加密 password 字段,其他字段明文保留)。
 * 这样 DataSource 行读出后 connectionConfig.password 是密文,
 * 解密走 decryptPassword()(自动剥 ENC:v1: 前缀,兼容旧明文)。
 */
export function encryptConnectionConfigPassword<
  T extends { password?: string | undefined },
>(config: T): T {
  if (typeof config.password !== "string" || config.password === "") {
    return config;
  }
  return { ...config, password: encryptPassword(config.password) };
}

/**
 * 解密 connectionConfig.password(明文其他字段保持)。
 * detect 加密格式:base64 字符串长度 > IV_LEN+AUTH_TAG_LEN + 看起来随机字符。
 * 我们用统一标识:密文以 ENC:v1: 前缀区分(避免混淆 plaintext password)。
 */
const ENC_PREFIX = "ENC:v1:";

export function decryptPassword(stored: string): string {
  if (stored.startsWith(ENC_PREFIX)) {
    return decryptString(stored.slice(ENC_PREFIX.length));
  }
  // 兼容旧的明文 password(平滑迁移)
  return stored;
}

export function encryptPassword(plain: string): string {
  return ENC_PREFIX + encryptString(plain);
}

/** 测试 / dev helper:生成合法 base64 32 字节 key */
export function generateTestKeyBase64(): string {
  return crypto.randomBytes(KEY_LEN).toString("base64");
}