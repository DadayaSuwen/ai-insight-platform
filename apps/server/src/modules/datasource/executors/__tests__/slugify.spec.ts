import {
  slugifyIdentifier,
  slugifyHeaders,
} from "../slugify";

/**
 * [Sprint 3] slugify 标识符单测 — 架构师避坑 #3 的兜底
 *
 * 验证场景:
 *   - 纯 ASCII(header): 简单空格 / 点 / 连字符 → snake_case
 *   - 数字开头: 加 _ prefix
 *   - 中文 / 纯符号 / emoji: hash 编码
 *   - 重复 slug: 末尾加 _N 去重
 *   - 长 header: 截断到 63
 */
describe("[Sprint 3 / V3] slugifyIdentifier CSV header 兼容", () => {
  test("空格 / 点 / 连字符转 underscore,小写", () => {
    expect(slugifyIdentifier("Employee ID")).toBe("employee_id");
    expect(slugifyIdentifier("Q1.2024")).toBe("q1_2024");
    expect(slugifyIdentifier("Sales-Region")).toBe("sales_region");
  });

  test("数字开头的 header 加下划线 prefix", () => {
    expect(slugifyIdentifier("1leading_digit")).toBe("_1leading_digit");
  });

  test("Unicode / 中文 header 转 hash 列", () => {
    const s1 = slugifyIdentifier("员工 姓名");
    const s2 = slugifyIdentifier("员工 姓名"); // 稳定
    expect(s1).toMatch(/^c[0-9a-f]+$/);
    expect(s1).toBe(s2);
  });

  test("emoji 同样走 hash", () => {
    // 纯 emoji (无 ASCII) → 全 hash
    expect(slugifyIdentifier("📊")).toMatch(/^c[0-9a-f]+$/);
  });

  test("货币符号 / 特殊字符去除", () => {
    expect(slugifyIdentifier("Sales ($)")).toBe("sales");
    expect(slugifyIdentifier("Profit/Loss")).toBe("profit_loss");
    expect(slugifyIdentifier("100%")).toBe("_100");
  });

  test("保留合法 snake_case 原貌", () => {
    expect(slugifyIdentifier("user_name")).toBe("user_name");
  });

  test("空字符串兜底", () => {
    expect(slugifyIdentifier("")).toBe("_col");
    expect(slugifyIdentifier("   ")).toBe("_col");
  });

  test("超长 header 截断到 63 字符", () => {
    const long = "a".repeat(120);
    expect(slugifyIdentifier(long).length).toBeLessThanOrEqual(63);
  });
});

describe("[Sprint 3] slugifyHeaders 批量 + 反向映射", () => {
  test("原始 → safe 单向映射", () => {
    const { map, inverseMap } = slugifyHeaders([
      "员工姓名",
      "Sales",
      "Q1 2024",
    ]);
    expect(Object.keys(map).sort()).toEqual(
      ["员工姓名", "Q1 2024", "Sales"].sort(),
    );
    // Sales → sales
    expect(map["Sales"]).toBe("sales");
    // 员工姓名 → c<hash>
    expect(map["员工姓名"]).toMatch(/^c[0-9a-f]+$/);
    // 反向 map
    expect(inverseMap["sales"]).toBe("Sales");
    expect(inverseMap[map["员工姓名"]]).toBe("员工姓名");
  });

  test("冲突去重 — 同 raw 不同名 slug 后缀 _2,_3", () => {
    const { map } = slugifyHeaders(["sales", "Sales ", "SALES"]);
    const safeNames = Object.values(map);
    expect(new Set(safeNames).size).toBe(3);
    // 至少有一个含 _2 / _3
    expect(safeNames.some(s => /_\d+$/.test(s))).toBe(true);
  });
});