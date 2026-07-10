import { inferSemantics } from "../infer-semantics";
import type { ColumnMetadata, MetadataSnapshot, TableMetadata } from "@workspace/types";

function makeColumn(name: string, rawType: string, role: ColumnMetadata["semanticRole"] = "identifier"): ColumnMetadata {
  return {
    name,
    rawType,
    semanticRole: role,
    cardinality: -1,
    sampleValues: [],
    isPrimaryKey: false,
    isForeignKey: false,
  };
}

function makeTable(name: string, columns: ColumnMetadata[]): TableMetadata {
  return { name, columns, fkHints: [] };
}

describe("[Sprint 1 / V3] MetadataService.inferSemantics", () => {
  test("numeric 列 → measure", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "x",
      fetchedAt: new Date().toISOString(),
      tables: [
        makeTable("order_items", [
          makeColumn("sales", "numeric"),
          makeColumn("quantity", "integer"),
          makeColumn("profit", "double precision"),
        ]),
      ],
      tokenEstimate: 0,
      truncated: false,
    };

    const out = inferSemantics(snap);
    const roles = out.tables[0].columns.map(c => c.semanticRole);
    expect(roles).toEqual(["measure", "measure", "measure"]);
  });

  test("date/timestamp 列 → time", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "x",
      fetchedAt: new Date().toISOString(),
      tables: [
        makeTable("orders", [
          makeColumn("orderDate", "timestamp(3)"),
          makeColumn("createdAt", "datetime"),
        ]),
      ],
      tokenEstimate: 0,
      truncated: false,
    };

    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("time");
    expect(out.tables[0].columns[1].semanticRole).toBe("time");
  });

  test("字符串列 → identifier (Sprint 1 暂不区分 dimension)", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "x",
      fetchedAt: new Date().toISOString(),
      tables: [
        makeTable("customers", [
          makeColumn("region", "text"),
          makeColumn("name", "varchar(255)"),
        ]),
      ],
      tokenEstimate: 0,
      truncated: false,
    };

    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("identifier");
    expect(out.tables[0].columns[1].semanticRole).toBe("identifier");
  });

  test("PK 列保持 identifier 不被误判为 measure", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "x",
      fetchedAt: new Date().toISOString(),
      tables: [
        makeTable("customers", [
          {
            ...makeColumn("id", "integer"),
            isPrimaryKey: true,
          },
        ]),
      ],
      tokenEstimate: 0,
      truncated: false,
    };

    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("identifier");
  });

  test("混合表 (实际场景) order_items.sales=measure, customers.region=identifier, orders.orderDate=time", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "test-ds",
      fetchedAt: new Date().toISOString(),
      tables: [
        makeTable("order_items", [
          makeColumn("sales", "numeric(10,2)"),
          makeColumn("quantity", "integer"),
          makeColumn("profit", "double precision"),
        ]),
        makeTable("customers", [
          makeColumn("region", "text"),
          makeColumn("state", "text"),
        ]),
        makeTable("orders", [
          makeColumn("orderDate", "timestamp(3)"),
          makeColumn("shipMode", "text"),
        ]),
      ],
      tokenEstimate: 0,
      truncated: false,
    };

    const out = inferSemantics(snap);
    const soi = out.tables.find(t => t.name === "order_items")!;
    const cust = out.tables.find(t => t.name === "customers")!;
    const ord = out.tables.find(t => t.name === "orders")!;

    expect(soi.columns.find(c => c.name === "sales")!.semanticRole).toBe("measure");
    expect(cust.columns.find(c => c.name === "region")!.semanticRole).toBe("identifier");
    expect(ord.columns.find(c => c.name === "orderDate")!.semanticRole).toBe("time");
  });

  test("已分类的列不会被覆盖", () => {
    const snap: MetadataSnapshot = {
      dataSourceId: "x",
      fetchedAt: new Date().toISOString(),
      tables: [
        makeTable("X", [
          // 已经标记为 dimension 的列不会被改回 identifier
          {
            ...makeColumn("foo", "text"),
            semanticRole: "dimension",
          },
        ]),
      ],
      tokenEstimate: 0,
      truncated: false,
    };

    const out = inferSemantics(snap);
    expect(out.tables[0].columns[0].semanticRole).toBe("dimension");
  });
});
