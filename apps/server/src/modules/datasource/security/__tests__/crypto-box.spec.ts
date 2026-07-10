import * as crypto from "node:crypto";
import {
  encryptString,
  decryptString,
  encryptConnectionConfigPassword,
  decryptPassword,
  encryptPassword,
  resetCryptoBoxForTests,
  generateTestKeyBase64,
} from "../crypto-box";

/**
 * [Sprint 4 / V3] AES-256-GCM 加密单元测试
 *
 * 覆盖:
 *   - encrypt → decrypt 双向对称
 *   - 同 plaintext 两次加密输出不同(IV 随机)
 *   - 篡改密文 → decrypt 抛错
 *   - 缺少 DB_CONFIG_ENCRYPTION_KEY → throw
 *   - 长度不对的密钥 → throw
 *   - encryptConnectionConfigPassword:只加密 password,其他字段明文
 *   - ENC:v1: 前缀 detect
 *   - 旧明文 password 解密路径(平滑迁移)
 */

describe("[Sprint 4 / V3] crypto-box AES-256-GCM", () => {
  const originalEnv = process.env.DB_CONFIG_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.DB_CONFIG_ENCRYPTION_KEY = generateTestKeyBase64();
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.DB_CONFIG_ENCRYPTION_KEY;
    } else {
      process.env.DB_CONFIG_ENCRYPTION_KEY = originalEnv;
    }
    resetCryptoBoxForTests();
  });

  beforeEach(() => {
    resetCryptoBoxForTests();
  });

  test("encrypt → decrypt 对称", () => {
    const plain = "super-secret-password-123!";
    const enc = encryptString(plain);
    const dec = decryptString(enc);
    expect(dec).toBe(plain);
  });

  test("同 plaintext 两次加密输出不同(IV 随机)", () => {
    const plain = "same-plain-text";
    const enc1 = encryptString(plain);
    const enc2 = encryptString(plain);
    expect(enc1).not.toBe(enc2);
    expect(decryptString(enc1)).toBe(plain);
    expect(decryptString(enc2)).toBe(plain);
  });

  test("篡改密文 → decrypt 抛错(authTag 检测)", () => {
    const enc = encryptString("important");
    const buf = Buffer.from(enc, "base64");
    // 翻转中间一个字节
    buf[buf.length - 5] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptString(tampered)).toThrow();
  });

  test("encryptPassword 加 ENC:v1: 前缀", () => {
    const enc = encryptPassword("my-pass");
    expect(enc.startsWith("ENC:v1:")).toBe(true);
    expect(decryptPassword(enc)).toBe("my-pass");
  });

  test("decryptPassword 兼容旧明文", () => {
    expect(decryptPassword("plaintext-pwd")).toBe("plaintext-pwd");
  });

  test("encryptConnectionConfigPassword 只动 password 字段", () => {
    const cfg = {
      type: "postgres" as const,
      host: "db.local",
      port: 5432,
      database: "analytics",
      user: "ai_insight_ro",
      password: "top-secret",
    };
    const enc = encryptConnectionConfigPassword(cfg);
    expect(enc.host).toBe("db.local");
    expect(enc.user).toBe("ai_insight_ro");
    expect(enc.password).not.toBe("top-secret");
    expect(enc.password?.startsWith("ENC:v1:")).toBe(true);
    expect(decryptPassword(enc.password!)).toBe("top-secret");
  });

  test("空 password 不加密", () => {
    const cfg = {
      type: "postgres" as const,
      host: "db.local",
      port: 5432,
      database: "analytics",
      user: "ai_insight_ro",
      password: "",
    };
    const enc = encryptConnectionConfigPassword(cfg);
    expect(enc.password).toBe("");
  });

  test("缺少 key → throw(架构师避坑 #2:绝不降级明文)", () => {
    delete process.env.DB_CONFIG_ENCRYPTION_KEY;
    resetCryptoBoxForTests();
    expect(() => encryptString("x")).toThrow(/DB_CONFIG_ENCRYPTION_KEY/);
  });

  test("密钥长度错 → throw", () => {
    process.env.DB_CONFIG_ENCRYPTION_KEY = crypto
      .randomBytes(16)
      .toString("base64"); // 16 字节 ≠ 32
    resetCryptoBoxForTests();
    expect(() => encryptString("x")).toThrow(/must decode to 32 bytes/);
  });
});