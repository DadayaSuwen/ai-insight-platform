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
  // Postgres JSONB 列。pg 驱动自动序列化 JS 对象。
  // 应用层**禁止**再 JSON.stringify，否则会产生双重转义 + 读取时
  // Kysely 自动 parse 后前端再次 parse 抛错被吞，导致 toolResults 丢失。
  metadata: Record<string, unknown> | null;
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
  LLMConfig: LLMConfigTable;
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

export interface LLMConfigTable {
  // id 是 provider（"openai" | "anthropic" | "ollama"），由应用层写入
  id: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  temperature: number;
  // 注意：Prisma 把 `updatedAt @updatedAt` 编译成 NOT NULL 列 + UPDATE 触发器，
  // 没有列默认值。所以必须由应用层写入，Kysely 的 `Generated<T>` 不适用。
  createdAt: Date;
  updatedAt: Date;
}

