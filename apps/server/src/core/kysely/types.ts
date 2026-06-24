// apps/server/src/core/kysely/types.ts
import { Generated } from "kysely";
export interface ChatSessionTable {
  id: Generated<string>;
  title: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ChatMessageTable {
  id: Generated<string>;
  sessionId: string;
  role: string; // 'user' | 'assistant'
  content: string;
  metadata: string | null; // 存储工具调用和结果的 JSON 字符串
  createdAt: Generated<Date>;
}

// 更新 Database 接口
export interface Database {
  Customer: CustomerTable;
  Product: ProductTable;
  SalesOrder: SalesOrderTable;
  SalesOrderItem: SalesOrderItemTable;
  ChatSession: ChatSessionTable;
  ChatMessage: ChatMessageTable;
}
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

