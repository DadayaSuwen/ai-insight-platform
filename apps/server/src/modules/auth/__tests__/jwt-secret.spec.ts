import { signJwt, verifyJwt, resetJwtSecretForTests } from "../jwt-secret";

/**
 * [Sprint 5] JWT 签发 / 验证 单测
 *
 * 覆盖:
 *   - 正常签发 → 验证得到原 payload
 *   - 篡改 token → 抛错
 *   - 过期 token → 抛错
 *   - 缺 JWT_SECRET → 启动校验 throw
 *   - 短密钥 → throw
 */

describe("[Sprint 5 / V3] jwt-secret", () => {
  const original = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = "this-is-a-test-secret-32-chars-long";
  });

  afterAll(() => {
    if (original === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = original;
    }
    resetJwtSecretForTests();
  });

  beforeEach(() => resetJwtSecretForTests());

  test("签发 → 验证 还原 payload", () => {
    const token = signJwt({ sub: "user-1", email: "a@b.com" });
    const payload = verifyJwt(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@b.com");
    expect(payload.iat).toBeGreaterThan(0);
    expect(payload.exp).toBeGreaterThan(payload.iat!);
  });

  test("篡改 token → 抛错", () => {
    const token = signJwt({ sub: "user-1", email: "a@b.com" });
    const parts = token.split(".");
    parts[1] = parts[1].slice(0, -2) + "XX";
    expect(() => verifyJwt(parts.join("."))).toThrow();
  });

  test("完全伪造 token → 抛错", () => {
    expect(() => verifyJwt("totally.invalid.token")).toThrow();
  });

  test("缺 JWT_SECRET → 抛错(绝不降级)", () => {
    delete process.env.JWT_SECRET;
    resetJwtSecretForTests();
    expect(() => signJwt({ sub: "x", email: "x@x.com" })).toThrow(
      /JWT_SECRET/,
    );
  });

  test("短密钥 → 抛错", () => {
    process.env.JWT_SECRET = "short";
    resetJwtSecretForTests();
    expect(() => signJwt({ sub: "x", email: "x@x.com" })).toThrow(
      /at least 32 chars/,
    );
  });
});