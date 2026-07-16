import type { MetadataSnapshot, TableMetadata } from "@workspace/types";
import { serializeForPrompt } from "../../../datasource/security/token-budget";

/**
 * [Sprint 2] PlannerAgent 硬性测试 — buildSystemPrompt 不含硬编码业务列名
 *
 * 实际测试 serializeForPrompt 的输出,因为 PlannerAgent.buildSystemPrompt
 * 是 private,它的输出 = serializeForPrompt(snapshot) + tool descriptions
 * + 通用规则文字。验证 serializeForPrompt 不含 'sales'/'region'/'category'/
 * 'profit' 等老 Superstore 域字面量,意味着即使 snapshot 偶然有这些列,
 * 序列化也只是按表名+列名+类型列出,没有把硬编码域知识混进去。
 */
describe("[Sprint 2 / V3] PlannerAgent system prompt 元数据驱动", () => {
  const sampleTable: TableMetadata = {
    name: "order_items",
    columns: [
      { name: "id", rawType: "text", semanticRole: "identifier", cardinality: 10000, sampleValues: [], isPrimaryKey: true, isForeignKey: false },
      { name: "sales", rawType: "numeric", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "quantity", rawType: "integer", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "profit", rawType: "double precision", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      { name: "discount", rawType: "double precision", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
    ],
    fkHints: [],
  };

  const sampleSnapshot: MetadataSnapshot = {
    dataSourceId: "test-ds",
    fetchedAt: new Date().toISOString(),
    tables: [sampleTable],
    tokenEstimate: 0,
    truncated: false,
  };

  test("serializeForPrompt 不含 旧 hardcoded 业务描述", () => {
    const out = serializeForPrompt(sampleSnapshot, { charBudget: 100_000 });
    // 这些字符串如果出现,意味着 buildSystemPrompt 仍然硬编码了
    // 老 Superstore 域的描述(应来自快照字段而非业务假设)
    // sample values 字段可能出现 'sales' (列名),所以我们只检
    // 测描述性短语,不是列名本身
    expect(out.text).not.toMatch(/家具|办公用品|电子产品|华东|华南|华中|西北/);
    expect(out.text).not.toMatch(/销售数据|销售订单|订单表|客户表|产品表/);
  });

  test("serializeForPrompt 列出表的列名(从 snapshot,非硬编码)", () => {
    const out = serializeForPrompt(sampleSnapshot, { charBudget: 100_000 });
    expect(out.text).toContain("order_items");
    // 列名应当出现 (来自 snapshot 字段)
    expect(out.text).toContain("sales");
    expect(out.text).toContain("quantity");
    expect(out.text).toContain("profit");
    // 角色标签应当出现
    expect(out.text).toMatch(/\[measure\]|\[identifier\]/);
  });

  test("大 snapshot 触发截断标记", () => {
    const manyTables: TableMetadata[] = Array.from({ length: 60 }, (_, i) => ({
      name: `T${i}`,
      columns: [
        { name: "id", rawType: "text", semanticRole: "identifier", cardinality: 100, sampleValues: [], isPrimaryKey: true, isForeignKey: false },
        { name: "v", rawType: "numeric", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
      ],
      fkHints: [],
    }));
    const snap: MetadataSnapshot = {
      ...sampleSnapshot,
      tables: manyTables,
    };
    const out = serializeForPrompt(snap, { charBudget: 2000 });
    expect(out.truncated).toBe(true);
    expect(out.text).toMatch(/## Schema \(truncated\)/);
  });

  test("不同 snapshot 产出不同的 prompt (不是 hardcoded)", () => {
    const ecommerce: MetadataSnapshot = {
      dataSourceId: "ecommerce-test",
      fetchedAt: new Date().toISOString(),
      tables: [
        {
          name: "orders",
          columns: [
            { name: "id", rawType: "integer", semanticRole: "identifier", cardinality: 1e6, sampleValues: [], isPrimaryKey: true, isForeignKey: false },
            { name: "amount", rawType: "numeric", semanticRole: "measure", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
            { name: "status", rawType: "text", semanticRole: "dimension", cardinality: 5, sampleValues: ["paid", "pending", "cancelled"], isPrimaryKey: false, isForeignKey: false },
            { name: "created_at", rawType: "timestamp", semanticRole: "time", cardinality: -1, sampleValues: [], isPrimaryKey: false, isForeignKey: false },
          ],
          fkHints: [],
        },
      ],
      tokenEstimate: 0,
      truncated: false,
    };
    const out = serializeForPrompt(ecommerce, { charBudget: 100_000 });
    expect(out.text).toContain("orders");
    expect(out.text).toContain("amount");
    expect(out.text).toContain("status");
    expect(out.text).toContain("created_at");
    expect(out.text).toMatch(/e\.g\. paid, pending, cancelled/);
  });
});