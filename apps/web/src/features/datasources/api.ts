import axiosInstance from '../../core/api/AxiosInstance';

/**
 * [Sprint 3+4 / V3] DataSource 前端 API
 *
 * 后端 endpoints:
 *   GET    /api/datasources                       → 列表
 *   GET    /api/datasources/:id                   → 详情
 *   POST   /api/datasources                       → 注册(数据库,密码自动加密)
 *   POST   /api/datasources/test                  → 测试连接(不写入)
 *   POST   /api/datasources/upload/preview        → CSV 预览(Step 1)
 *   POST   /api/datasources/upload/register       → CSV 注册带列覆写(Step 2)
 *   DELETE /api/datasources/upload/:uploadId      → 取消上传
 *   POST   /api/datasources/:id/refresh           → 重新 introspect + 清缓存
 *   DELETE /api/datasources/:id                   → 删除
 *
 * 数据契约见 packages/types/src/datasource.ts
 */

export interface DataSourceListItem {
  id: string;
  name: string;
  description: string | null;
  /** "postgres" | "mysql" | "duckdb-csv" */
  type: string;
  status: string;
  lastError: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * CSV 列覆写 — 前端预览页用户修改后的列名 / 类型
 * 后端用 TRY_CAST 防止类型冲突脏数据
 */
export interface ColumnOverride {
  originalName: string;
  newName: string;
  type: 'AUTO' | 'VARCHAR' | 'DECIMAL' | 'DATE' | 'BOOLEAN';
  alias?: string; // [Sprint 5.7+] 中文别名
}

export interface UploadPreviewColumn {
  originalName: string;
  defaultName: string;
  defaultType: string;
  sampleValues: string[];
}

export interface UploadPreviewResponse {
  uploadId: string;
  originalName: string;
  columns: UploadPreviewColumn[];
  previewRows: Array<Record<string, string>>;
  rowCount: number;
}

export interface UploadRegisterResponse {
  id: string;
  name: string;
  columnCount: number;
  rowCount: number;
}

/**
 * 数据库连接类型 — 后端 ConnectionConfig 的子集(密码可选)
 */
export interface DatabaseConnectionPayload {
  type: 'postgres' | 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
  schema?: string;
}

export async function listDataSources(): Promise<DataSourceListItem[]> {
  const res = await axiosInstance.get<{
    success: boolean;
    data: DataSourceListItem[];
  }>('/api/datasources');
  return res.data.data ?? [];
}

export async function refreshDataSource(id: string): Promise<void> {
  await axiosInstance.post(`/api/datasources/${id}/refresh`);
}

export async function deleteDataSource(id: string): Promise<void> {
  await axiosInstance.delete(`/api/datasources/${id}`);
}

/**
 * 注册数据库连接 — 后端会加密 password 后存储
 */
export async function registerDatabaseConnection(opts: {
  id: string;
  name: string;
  description?: string;
  config: DatabaseConnectionPayload;
}): Promise<DataSourceListItem> {
  const { config, ...rest } = opts;
  const res = await axiosInstance.post<{
    success: boolean;
    data: DataSourceListItem;
  }>('/api/datasources', {
    ...rest,
    type: config.type,
    connectionConfig: config,
  });
  return res.data.data;
}

/**
 * 测试数据库连接 — 不写入 DataSource 表,只返回连通性
 */
export async function testDatabaseConnection(
  config: DatabaseConnectionPayload
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const res = await axiosInstance.post<{
    success: boolean;
    data: { ok: boolean; latencyMs: number };
  }>('/api/datasources/test', config);
  return res.data.data;
}

/**
 * [Sprint 5.7+] 请求 LLM 生成中文别名 (预览阶段)
 */
export async function fetchColumnAliases(columns: Array<{ name: string; samples: string[] }>): Promise<Record<string, string>> {
  const res = await axiosInstance.post<{
    success: boolean;
    data: { aliases: Record<string, string> };
  }>('/api/datasources/upload/preview/aliases', { columns });
  return res.data.data.aliases;
}

/**
 * CSV Step 1 — 上传文件 + 返回预览
 */
export async function uploadCsvPreview(opts: {
  file: File;
  onUploadProgress?: (e: { loaded: number; total?: number }) => void;
}): Promise<UploadPreviewResponse> {
  const form = new FormData();
  form.append('file', opts.file);
  const res = await axiosInstance.post<{
    success: boolean;
    data: UploadPreviewResponse;
  }>('/api/datasources/upload/preview', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e =>
      opts.onUploadProgress?.({ loaded: e.loaded, total: e.total }),
  });
  return res.data.data;
}

/**
 * CSV Step 2 — 用 preview 结果注册 DataSource,可带 columnOverrides
 */
export async function registerCsvFromPreview(opts: {
  uploadId: string;
  name?: string;
  columnOverrides: ColumnOverride[];
}): Promise<UploadRegisterResponse> {
  const res = await axiosInstance.post<{
    success: boolean;
    data: UploadRegisterResponse;
  }>('/api/datasources/upload/register', opts);
  return res.data.data;
}

/**
 * 取消上传 + 清理临时文件
 */
export async function cancelUpload(uploadId: string): Promise<void> {
  await axiosInstance.delete(`/api/datasources/upload/${uploadId}`);
}