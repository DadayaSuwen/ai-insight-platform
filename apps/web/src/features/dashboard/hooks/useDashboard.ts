import { useState, useEffect, useCallback } from 'react';
import { generateDashboard, getDashboard } from '../api';
import type { DashboardConfig } from '../api';

export function useDashboard(datasourceId: string | undefined) {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!datasourceId) return;
    setLoading(true);
    setError(null);
    try {
      // Try getting existing config first
      let data: DashboardConfig | null = null;
      try {
        data = await getDashboard(datasourceId);
      } catch {
        // Not found — generate
      }
      if (!data) {
        data = await generateDashboard(datasourceId);
      }
      setConfig(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [datasourceId]);

  useEffect(() => {
    load();
  }, [load]);

  const regenerate = useCallback(async () => {
    if (!datasourceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generateDashboard(datasourceId);
      setConfig(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [datasourceId]);

  return { config, loading, error, regenerate };
}
