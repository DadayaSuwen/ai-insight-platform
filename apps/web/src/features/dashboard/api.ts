import axiosInstance from '../../core/api/AxiosInstance';

export interface KpiSpec {
  label: string;
  table: string;
  metric: string;
  filter?: string;
  icon?: string;
  comparison?: string;
}

export interface ChartSpec {
  title: string;
  type: string;
  table: string;
  timeField?: string;
  metric: string;
  groupBy?: string;
  interval?: string;
  range?: string;
}

export interface InsightSpec {
  type: 'trend_anomaly' | 'distribution_change' | 'opportunity' | 'risk';
  table: string;
  metric: string;
  description: string;
}

export interface DashboardConfig {
  kpis: KpiSpec[];
  charts: ChartSpec[];
  insights: InsightSpec[];
}

export async function generateDashboard(datasourceId: string): Promise<DashboardConfig> {
  const res = await axiosInstance.post<{ success: boolean; data: DashboardConfig }>(
    '/api/dashboard/generate',
    { datasourceId },
  );
  return res.data.data;
}

export async function getDashboard(datasourceId: string): Promise<DashboardConfig> {
  const res = await axiosInstance.get<{ success: boolean; data: DashboardConfig }>(
    `/api/dashboard/${datasourceId}`,
  );
  return res.data.data;
}
