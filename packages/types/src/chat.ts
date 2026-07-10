import { z } from 'zod';

// ============================================
// SSE Event Types
// ============================================

/**
 * SSE event types for streaming responses
 */
export enum SSEEventType {
  TEXT = 'text',
  SQL = 'sql',
  CHART = 'chart',
  ANALYSIS = 'analysis',
  ERROR = 'error',
  DONE = 'done',
  // Planner tool-calling events
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  THINKING = 'thinking',
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
 *
 * [Sprint 2] 新增 dataSourceId: 绑定的数据源 id。
 *   - 不传: 由用户在下拉中选择或在 session 中绑定
 *   - 传已注册的 dataSource id: 显式绑定
 */
export const CreateSessionRequestSchema = z.object({
  title: z.string().optional(),
  userId: z.string().optional(),
  dataSourceId: z.string().min(1).max(64).optional(),
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
 *
 * [Sprint 2] 新增 dataSourceId (nullable)。
 */
export const ChatSessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  userId: z.string().nullable(),
  dataSourceId: z.string().nullable().default(null),
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
 *
 * @deprecated 自 ChartAgent 升级 (M1) 起,旧 SSE SQL 事件已无业务路径消费。
 * 新管线 SQL 通过 `SSEToolResultDataSchema.result.sql/rows` 传递。
 * 保留 1 个 release 以兼容历史消息回放,M5 将彻底删除。
 */
export const SSESQLDataSchema = z.object({
  sql: z.string(),
  executed: z.boolean().default(false),
  rows: z.array(z.record(z.string(), z.any())).optional(),
});

/** @deprecated 见 SSESQLDataSchema */
export type SSESQLData = z.infer<typeof SSESQLDataSchema>;

/**
 * SSE chart event data
 *
 * @deprecated 自 ChartAgent 升级 (M1) 起,旧 SSE CHART 事件已无业务路径消费。
 * 新管线通过 `SSEToolResultDataSchema.result.chart` (EChartsOption) 传递图表数据。
 * 保留 1 个 release 以兼容历史消息回放,M5 将彻底删除。
 */
export const SSEChartDataSchema = z.object({
  chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area']),
  title: z.string().optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  data: z.record(z.string(), z.any()),
});

/** @deprecated 见 SSEChartDataSchema */
export type SSEChartData = z.infer<typeof SSEChartDataSchema>;

// ============================================================
// ECharts Option 契约 (ChartAgent 升级新增)
// ============================================================
//
// 设计原则:
// - LLM 直出完整 EChartsOption JSON,后端做轻量校验
// - 顶层 .passthrough() 保留所有 ECharts 扩展字段 (visualMap, dataZoom, polar, ...)
// - 只对关键字段 (series 必填非空) 做存在性约束
// - ECHART_SERIES_TYPES 同时被 chart-validator (M3) 和前端 (M4) 引用
//

/**
 * 全量 ECharts series type 白名单
 * - 核心 18 类: echarts 5.x 原生
 * - 3D 7 类:    echarts-gl 扩展
 * - 插件 2 类:   echarts-liquidfill / echarts-wordcloud
 * - 特殊:       custom (用户自定义 series)
 *
 * 前后端共用此数组:后端用于 chart-validator 校验 series.type,
 * 前端用于 DynamicChart 决定是否 dynamic import 对应扩展包。
 */
export const ECHART_SERIES_TYPES = [
  // 核心 18 类 (echarts 5.x 原生)
  'line',
  'bar',
  'pie',
  'scatter',
  'graph',
  'map',
  'gauge',
  'pictorialBar',
  'radar',
  'tree',
  'treemap',
  'sunburst',
  'boxplot',
  'candlestick',
  'heatmap',
  'parallel',
  'sankey',
  'funnel',
  'custom',
  // 时序
  'themeRiver',
  // echarts-gl 扩展 (M4 引入)
  'bar3D',
  'scatter3D',
  'surface3D',
  'map3D',
  'lines3D',
  'line3D',
  'points3D',
  // 扩展插件 (M4 引入)
  'liquidFill',
  'wordCloud',
] as const;

export type EChartSeriesType = (typeof ECHART_SERIES_TYPES)[number];

/**
 * EChartsOption 的轻量 Zod schema
 *
 * 故意保持宽松:只校验 series 非空数组,其余字段 .passthrough()
 * 让 ECharts 自己处理未知字段 (如 3D 系列的 grid3D/xAxis3D)。
 *
 * 业务级校验 (series.type 白名单 / 体积护栏 / 幻觉检测) 在
 * `apps/server/src/modules/ai/tools/chart-validator.ts` 完成 (M3 引入)。
 */
export const EChartsOptionSchema = z
  .object({
    // 核心数据结构 — Prompt 强制要求 (GUARD-3a)
    title: z.unknown().optional(),
    tooltip: z.unknown().optional(),
    legend: z.unknown().optional(),
    xAxis: z.union([z.unknown(), z.array(z.unknown())]).optional(),
    yAxis: z.union([z.unknown(), z.array(z.unknown())]).optional(),
    grid: z.unknown().optional(),
    dataset: z.unknown().optional(),
    // series 必填非空 (M3 chart-validator 会进一步校验 type 白名单)
    series: z
      .array(
        z
          .object({
            type: z.string().optional(), // LLM 经常把 type 漏到 series[0],由 validator 兜底
          })
          .passthrough(),
      )
      .min(1, 'series 至少 1 个'),

    // ECharts 扩展组件 — 全部 .passthrough() 让 ECharts 自处理
    color: z.array(z.string()).optional(),
    backgroundColor: z.string().optional(),
    dataZoom: z.union([z.unknown(), z.array(z.unknown())]).optional(),
    visualMap: z.union([z.unknown(), z.array(z.unknown())]).optional(),
    toolbox: z.unknown().optional(),
    brush: z.unknown().optional(),
    geo: z.unknown().optional(),
    polar: z.unknown().optional(),
    radiusAxis: z.unknown().optional(),
    angleAxis: z.unknown().optional(),
    radar: z.unknown().optional(),
    parallelAxis: z.unknown().optional(),
    textStyle: z.unknown().optional(),
    animation: z.boolean().optional(),
    animationDuration: z.number().optional(),
  })
  .passthrough();

/** ECharts option 的 TS 类型 (前后端共用) */
export type EChartsOption = z.infer<typeof EChartsOptionSchema>;

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

/**
 * SSE tool_call event data
 */
export const SSEToolCallDataSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.any()),
});

export type SSEToolCallData = z.infer<typeof SSEToolCallDataSchema>;

/**
 * SSE tool_result event data
 *
 * M1 升级:result.chart 从 `z.record(z.string(), z.any())` 升级为
 * `EChartsOptionSchema.optional()`,前端 DynamicChart 仍按原方式透传 option,
 * 但 TS 类型系统能正确推断 series/xAxis/yAxis 等字段 (供 M3 chartAgent 复用)。
 *
 * 新增字段:
 * - chartType:  LLM 选择的图表系列 (line/bar/.../bar3D/liquidFill/...),前端可选显示
 * - chartSource: 'agent' (LLM 生成) | 'fallback' (ChartHelper 模板),前端用于 UI 标签 (M5)
 */
/**
 * [M5-Patch] ChartIntent 字段契约 (前后端共享)
 * - colorPalette: 用户指定的颜色数组 (LLM 提取),前端注入到 ECharts option.color
 * - mapType: 地图类型标识 (china/world/usa/prov-*),前端 ensureMap 按需加载
 * - layout: inline (默认) | fullscreen (全屏展示)
 */
export const ChartIntentPayloadSchema = z.object({
  chartType: z.string().optional(),
  xField: z.string().optional(),
  yField: z.string().optional(),
  groupBy: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  colorPalette: z.array(z.string()).optional(),
  mapType: z.string().optional(),
  layout: z.enum(['inline', 'fullscreen']).optional(),
});

export type ChartIntentPayload = z.infer<typeof ChartIntentPayloadSchema>;

export const SSEToolResultDataSchema = z.object({
  name: z.string(),
  result: z.object({
    sql: z.string().optional(),
    rows: z.array(z.record(z.string(), z.any())).optional(),
    chart: EChartsOptionSchema.optional(),
    chartType: z.string().optional(),
    chartSource: z.enum(['agent', 'fallback']).optional(),
    metrics: z.array(z.string()).optional(),
    metricLabels: z.record(z.string(), z.string()).optional(),
    groupBy: z.string().optional(),
    analysis: z.string().optional(),
    rowCount: z.number().optional(),
    reply: z.string().optional(),
    error: z.string().optional(),
    // [M5-Patch] 透传 ChartIntent (LLM 提取的样式/地图/布局意图)
    intent: ChartIntentPayloadSchema.optional(),
    // [Sprint 5.7] 物理名 → 中文名映射表 (供前端渲染中文表头和图例)
    fieldMapping: z.record(z.string(), z.string()).optional(),
  }),
});

export type SSEToolResultData = z.infer<typeof SSEToolResultDataSchema>;
export type SSEToolResult = z.infer<typeof SSEToolResultDataSchema>['result'];

/**
 * SSE thinking event data (optional — LLM intermediate reasoning)
 */
export const SSEThinkingDataSchema = z.object({
  content: z.string(),
});

export type SSEThinkingData = z.infer<typeof SSEThinkingDataSchema>;

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