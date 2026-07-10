// apps/server/src/core/kysely/types.ts
import { Generated } from "kysely";

// [Sprint 5] User 表 — Multi-Tenant
export interface UserTable {
  id: Generated<string>;
  email: string;
  passwordHash: string;
  createdAt: Generated<Date>;
  updatedAt: Date;
}

export interface ChatSessionTable {
  id: Generated<string>;
  // [Sprint 5] userId 必填,FK 到 User
  userId: string;
  title: string;
  // [Sprint 2/V3] 多数据源绑定;null = 未绑定数据源
  dataSourceId: string | null;
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

// [Sprint 5.5] 业务表接口(CustomerTable/ProductTable/SalesOrderTable/
// SalesOrderItemTable)已删除。主数据库只存平台元数据。

// 更新 Database 接口
export interface Database {
  User: UserTable;
  ChatSession: ChatSessionTable;
  ChatMessage: ChatMessageTable;
  LLMConfig: LLMConfigTable;
  DataSource: DataSourceTable;
  DataSourceSnapshot: DataSourceSnapshotTable;
}

export interface LLMConfigTable {
  // id 是 provider（"openai" | "anthropic"），由应用层写入
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

// ─── [Sprint 1] Multi-Datasource V3 ───────────────────────────
export interface DataSourceTable {
  id: string;
  // [Sprint 5] userId 必填,FK 到 User,delete user → cascade delete
  userId: string;
  name: string;
  description: string | null;
  type: string; // 'postgres' | 'mysql' | 'duckdb-csv'
  // JSONB 列:connectionConfig 是 discriminated union (ConnectionConfigSchema)
  connectionConfig: Record<string, unknown>;
  status: string; // 'active' | 'paused' | 'error'
  lastError: string | null;
  createdAt: Generated<Date>;
  updatedAt: Date;
}

export interface DataSourceSnapshotTable {
  id: Generated<string>;
  dataSourceId: string;
  payload: Record<string, unknown>;
  fetchedAt: Generated<Date>;
  tokenEstimate: number;
  truncated: boolean;
}

