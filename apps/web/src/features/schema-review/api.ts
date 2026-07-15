import axiosInstance from '../../core/api/AxiosInstance';

/**
 * [Sprint 6] Schema Review API
 */

export interface PendingField {
  table: string;
  field: string;
  rawType: string;
  currentGuess: string;
  confidence: number;
  sampleValues: string[];
}

export interface StartReviewResponse {
  reviewId: string;
  pendingFields: number;
  fields: PendingField[];
}

export interface ReviewMessage {
  role: 'ai' | 'user';
  content: string;
  fieldName?: string;
  quickReplies?: string[];
  ts: string;
}

/**
 * [Fix-2 Task 2.3] ConfirmPage 用的 schema understanding 类型
 * 与后端 datasource.service 的 metadata.get 输出对齐:
 *   tables: [{ name, rowCount, columns: [{ name, rawType, chineseName, semanticRole, description }] }]
 *   relations: 可选 — 来自 explore.service.inferRelations (留作扩展)
 */
export interface SchemaUnderstanding {
  tables: Array<{
    name: string;
    rowCount?: number;
    columns: Array<{
      name: string;
      rawType: string;
      chineseName?: string;
      semanticRole?: string;
      description?: string;
    }>;
  }>;
  relations?: Array<{ from: string; to: string; confidence: number }>;
  finalizedAt?: string;
}

export async function startReview(datasourceId: string): Promise<StartReviewResponse> {
  const res = await axiosInstance.post<{ success: boolean; data: StartReviewResponse }>(
    '/api/schema/review/start',
    { datasourceId },
  );
  return res.data.data;
}

export async function finalizeReview(reviewId: string): Promise<{ schemaUnderstanding: Record<string, unknown> }> {
  const res = await axiosInstance.post<{ success: boolean; data: { schemaUnderstanding: Record<string, unknown> } }>(
    '/api/schema/review/finalize',
    { reviewId },
  );
  return res.data.data;
}

/**
 * [Fix-2 Task 2.3] 按 datasourceId 拉 schema understanding — ConfirmPage 渲染用
 */
export async function getDatasourceSchema(datasourceId: string): Promise<{
  schemaUnderstanding: SchemaUnderstanding | null;
  exploreStatus: string;
}> {
  const res = await axiosInstance.get<{
    success: boolean;
    data: {
      schemaUnderstanding?: SchemaUnderstanding | null;
      exploreStatus: string;
    };
  }>(`/api/datasources/${datasourceId}`);
  return {
    schemaUnderstanding: res.data.data?.schemaUnderstanding ?? null,
    exploreStatus: res.data.data?.exploreStatus ?? 'unknown',
  };
}
