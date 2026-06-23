import { z } from 'zod';

// ============================================
// SSE Event Types
// ============================================

/**
 * SSE event types for streaming responses
 */
export enum SSEEventType {
  TOKEN = 'token',
  SQL = 'sql',
  CHART = 'chart',
  ANALYSIS = 'analysis',
  ERROR = 'error',
  DONE = 'done',
}

// ============================================
// Chat Message Schemas
// ============================================

/**
 * Chat message role
 */
export const ChatRoleSchema = z.enum(['user', 'assistant', 'system']);

/**
 * Chat message schema
 */
export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Message type alias for frontend store
 */
export type Message = ChatMessage;

// ============================================
// Chat Request Schemas
// ============================================

/**
 * Chat message request
 */
export const ChatMessageRequestSchema = z.object({
  message: z.string().min(1, { message: '消息内容不能为空' }),
  sessionId: z.string().uuid().optional(),
});

export type ChatMessageRequest = z.infer<typeof ChatMessageRequestSchema>;

/**
 * Create new chat session request
 */
export const CreateSessionRequestSchema = z.object({
  title: z.string().optional(),
  userId: z.string().optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

// ============================================
// Chat Response Schemas
// ============================================

/**
 * Chat message response
 */
export const ChatMessageResponseSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string(),
});

export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>;

/**
 * Chat session schema
 */
export const ChatSessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ChatSession = z.infer<typeof ChatSessionSchema>;

/**
 * Chat history response
 */
export const ChatHistoryResponseSchema = z.object({
  session: ChatSessionSchema,
  messages: z.array(ChatMessageSchema),
});

export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>;

// ============================================
// SSE Message Schemas
// ============================================

/**
 * SSE message schema for streaming
 */
export const SSEMessageSchema = z.object({
  event: z.nativeEnum(SSEEventType),
  data: z.string(),
});

export type SSEMessage = z.infer<typeof SSEMessageSchema>;

/**
 * SSE token event data
 */
export const SSETokenDataSchema = z.object({
  content: z.string(),
  isFinal: z.boolean().default(false),
});

export type SSETokenData = z.infer<typeof SSETokenDataSchema>;

/**
 * SSE SQL event data
 */
export const SSESQLDataSchema = z.object({
  sql: z.string(),
  executed: z.boolean().default(false),
  rows: z.array(z.record(z.string(), z.any())).optional(),
});

export type SSESQLData = z.infer<typeof SSESQLDataSchema>;

/**
 * SSE chart event data
 */
export const SSEChartDataSchema = z.object({
  chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area']),
  title: z.string().optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  data: z.record(z.string(), z.any()),
});

export type SSEChartData = z.infer<typeof SSEChartDataSchema>;

/**
 * SSE analysis event data
 */
export const SSEAnalysisDataSchema = z.object({
  content: z.string(),
  keyInsights: z.array(z.string()).optional(),
});

export type SSEAnalysisData = z.infer<typeof SSEAnalysisDataSchema>;

/**
 * SSE error event data
 */
export const SSEErrorDataSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  details: z.string().optional(),
});

export type SSEErrorData = z.infer<typeof SSEErrorDataSchema>;

// ============================================
// API Response Schemas
// ============================================

/**
 * Generic API success response
 */
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

export type ApiSuccessResponse = z.infer<typeof ApiSuccessResponseSchema>;

/**
 * Generic API error response
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Generic API response
 */
export const ApiResponseSchema = z.union([
  ApiSuccessResponseSchema,
  ApiErrorResponseSchema,
]);

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

// ============================================
// Validation Helper Functions
// ============================================

/**
 * Validate chat message request
 */
export function validateChatMessageRequest(data: unknown): ChatMessageRequest {
  return ChatMessageRequestSchema.parse(data);
}

/**
 * Validate and sanitize chat message request (strips unknown fields)
 */
export function safeParseChatMessageRequest(data: unknown): ChatMessageRequest | null {
  return ChatMessageRequestSchema.safeParse(data).success
    ? ChatMessageRequestSchema.parse(data)
    : null;
}