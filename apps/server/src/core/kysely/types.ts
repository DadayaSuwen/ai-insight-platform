// apps/server/src/core/kysely/types.ts
import { Generated } from "kysely";

export interface CustomerTable {
  id: string;
  name: string;
  segment: string;
  region: string;
  state: string;
  city: string;
}

export interface ProductTable {
  id: string;
  name: string;
  category: string;
  subCategory: string;
}

export interface SalesOrderTable {
  id: string;
  orderDate: Date;
  shipDate: Date | null;
  shipMode: string;
  customerId: string;
}

export interface SalesOrderItemTable {
  id: Generated<string>;
  orderId: string;
  productId: string;
  sales: number;
  quantity: number;
  discount: number;
  profit: number;
}

// Kysely 的根 Database 接口
// 这里的 key 必须与数据库里的表名完全一致
export interface Database {
  Customer: CustomerTable;
  Product: ProductTable;
  SalesOrder: SalesOrderTable;
  SalesOrderItem: SalesOrderItemTable;
}
