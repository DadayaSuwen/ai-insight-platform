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
