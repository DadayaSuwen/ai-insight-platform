import { useEffect, useState } from "react";
import { insightsApi } from "./api";

/**
 * [Sprint 5.7] 主动洞察数量 hook
 *
 * 根据当前数据源 ID 实时拉取活跃洞察数量,
 * 用于侧边栏 "主动洞察" 菜单项的 badge 显示。
 * datasourceId 变化时自动重新拉取。
 */
export function useInsightCount(datasourceId: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!datasourceId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    insightsApi
      .count(datasourceId)
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [datasourceId]);

  return count;
}
