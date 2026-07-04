import { PrismaClient } from "@prisma/client";
import fs from "fs";
import csv from "csv-parser";

const prisma = new PrismaClient();

// ============================================================
// 中英映射表 (CSV 是英文, 工具 enum 是中文, DB 必须存中文才能匹配)
// ============================================================
const REGION_MAP: Record<string, string> = {
  South: "华南",
  West: "西北",
  East: "华东",
  Central: "华中",
};

const CATEGORY_MAP: Record<string, string> = {
  Furniture: "家具",
  "Office Supplies": "办公用品",
  Technology: "电子产品",
};

const mapRegion = (raw: string): string => REGION_MAP[raw] ?? raw;
const mapCategory = (raw: string): string => CATEGORY_MAP[raw] ?? raw;

// 解析 CSV 中的 M/D/YYYY 日期格式
function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    // Month/Day/Year
    return new Date(
      `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`,
    );
  }
  return new Date(dateStr);
}

async function main() {
  console.log("开始清理旧数据...");
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();

  console.log("开始读取并清洗 CSV 数据...");

  const customers = new Map<string, any>();
  const products = new Map<string, any>();
  const orders = new Map<string, any>();
  const orderItems: any[] = [];

  // 1. 流式读取 CSV 并在内存中去重
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream("./prisma/data/superstore_sales.csv")
      .pipe(csv())
      .on("data", (row) => {
        // 提取客户
        const customerId = row["Customer ID"];
        if (!customers.has(customerId)) {
          customers.set(customerId, {
            id: customerId,
            name: row["Customer Name"],
            segment: row["Segment"],
            region: mapRegion(row["Region"]),
            state: row["State"],
            city: row["City"],
          });
        }

        // 提取产品
        const productId = row["Product ID"];
        if (!products.has(productId)) {
          products.set(productId, {
            id: productId,
            name: row["Product Name"].substring(0, 200), // 防止字符串过长
            category: mapCategory(row["Category"]),
            subCategory: row["Sub-Category"],
          });
        }

        // 提取订单主表
        const orderId = row["Order ID"];
        if (!orders.has(orderId)) {
          orders.set(orderId, {
            id: orderId,
            orderDate: parseDate(row["Order Date"]),
            shipDate: parseDate(row["Ship Date"]),
            shipMode: row["Ship Mode"],
            customerId: customerId,
          });
        }

        // 提取订单明细
        orderItems.push({
          id: row["Row ID"],
          orderId: orderId,
          productId: productId,
          sales: parseFloat(row["Sales"]) || 0,
          quantity: parseInt(row["Quantity"]) || 1,
          discount: parseFloat(row["Discount"]) || 0,
          profit: parseFloat(row["Profit"]) || 0,
        });
      })
      .on("end", () => {
        console.log(
          `数据读取完毕: ${customers.size} 个客户, ${products.size} 个产品, ${orders.size} 个订单, ${orderItems.length} 条明细。`,
        );
        resolve();
      })
      .on("error", reject);
  });

  // 2. 批量写入数据库 (使用事务保证一致性)
  console.log("开始批量写入数据库...");

  const batchSize = 2000;

  await prisma.$transaction([
    prisma.customer.createMany({ data: Array.from(customers.values()) }),
    prisma.product.createMany({ data: Array.from(products.values()) }),
    prisma.salesOrder.createMany({ data: Array.from(orders.values()) }),
  ]);
  console.log("客户、产品、订单主表写入完成！");

  // 分批写入明细表，防止内存溢出
  for (let i = 0; i < orderItems.length; i += batchSize) {
    const batch = orderItems.slice(i, i + batchSize);
    await prisma.salesOrderItem.createMany({ data: batch });
    process.stdout.write(
      `已写入明细: ${Math.min(i + batchSize, orderItems.length)}/${orderItems.length}\r`,
    );
  }

  console.log("\n✅ 真实业务数据导入完成！");
}

main()
  .catch((e) => {
    console.error("导入失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
