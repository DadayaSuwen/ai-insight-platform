import axiosInstance from '../../core/api/AxiosInstance';

/**
 * [Fix-2 Task 2.2] Insight 与后端 schema.prisma 的 Insight 模型对齐
 *  - type: 'risk' | 'anomaly' | 'opportunity' (来自 anomaly-detector)
 *  - severity: 'high' | 'medium' | 'low'
 *  - status: 'active' | 'handled'
 */
export interface Insight {
  id: string;
  datasourceId: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  suggestion: string | null;
  status: string;
  detectedAt: string;
  handledAt: string | null;
}

export const insightsApi = {
  /** 列出数据源的洞察 (Task 1.8 已加 ownership 过滤) */
  list: async (datasourceId: string, range: string): Promise<Insight[]> => {
    const res = await axiosInstance.get<{ success: boolean; data: Insight[] }>(
      '/api/insights',
      { params: { datasourceId, range } },
    );
    return res.data.data ?? [];
  },

  dismiss: (insightId: string) =>
    axiosInstance.post<{ success: boolean }>(`/api/insights/${insightId}/dismiss`),

  shield: (insightId: string) =>
    axiosInstance.post<{ success: boolean }>(`/api/insights/${insightId}/shield`),

  /** 获取数据源的活跃洞察数量 (用于侧边栏 badge) */
  count: async (datasourceId: string): Promise<number> => {
    const res = await axiosInstance.get<{
      success: boolean;
      data: { count: number };
    }>("/api/insights/count", { params: { datasourceId } });
    return res.data.data?.count ?? 0;
  },

  /** 手动触发巡检 */
  runNow: (datasourceId: string) =>
    axiosInstance.post<{ success: boolean; data?: unknown }>(
      "/api/insights/run-now",
      null,
      { params: { datasourceId } },
    ),
};
