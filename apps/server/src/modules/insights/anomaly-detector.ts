/**
 * [Sprint 6] AnomalyDetector — 多层异常检测
 *
 * 策略:
 *   1. Z-score > 2 → anomaly
 *   2. 环比变化 > 30% → distribution_change
 *   3. 连续下降 > 2 期 → trend_anomaly
 *
 * 轻量级纯函数, 不依赖 LLM。
 */

export interface AnomalyResult {
  type: "risk" | "anomaly" | "opportunity";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  suggestion: string;
}

/**
 * Z-score 异常检测
 * @param values 数值序列 (最近的值在最后)
 * @param threshold Z-score 阈值, 默认 2.0
 */
export function detectZScoreAnomaly(
  values: number[],
  threshold = 2.0,
): AnomalyResult[] {
  if (values.length < 3) return [];

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  const results: AnomalyResult[] = [];
  const latest = values[n - 1];
  const zScore = (latest - mean) / stdDev;

  if (Math.abs(zScore) > threshold) {
    const direction = zScore > 0 ? "上升" : "下降";
    results.push({
      type: zScore > 0 ? "opportunity" : "risk",
      severity: Math.abs(zScore) > 3 ? "high" : "medium",
      title: `指标异常${direction} (Z-score=${zScore.toFixed(1)})`,
      description: `最近值 ${latest.toFixed(2)} 显著${direction}, 偏离均值 ${mean.toFixed(2)} ${Math.abs(zScore).toFixed(1)} 个标准差`,
      evidence: { mean, stdDev, zScore, latest, values },
      suggestion: `建议排查${direction}原因, 关注是否需要干预`,
    });
  }

  return results;
}

/**
 * 环比变化检测
 * @param current 当前值
 * @param previous 上期值
 * @param threshold 变化阈值, 默认 0.3 (30%)
 */
export function detectChangeRate(
  current: number,
  previous: number,
  threshold = 0.3,
): AnomalyResult | null {
  if (previous === 0) return null;

  const rate = (current - previous) / Math.abs(previous);
  if (Math.abs(rate) < threshold) return null;

  const direction = rate > 0 ? "上升" : "下降";
  return {
    type: rate > 0 ? "opportunity" : "risk",
    severity: Math.abs(rate) > 0.5 ? "high" : "medium",
    title: `环比${direction} ${(Math.abs(rate) * 100).toFixed(0)}%`,
    description: `从 ${previous.toFixed(2)} 变为 ${current.toFixed(2)} (${direction} ${(Math.abs(rate) * 100).toFixed(1)}%)`,
    evidence: { current, previous, rate },
    suggestion: `环比变化超过阈值 ${(threshold * 100).toFixed(0)}%, 建议关注`,
  };
}

/**
 * 连续趋势检测
 * @param values 数值序列 (最近的值在最后)
 * @param consecutive 连续几期, 默认 2
 */
export function detectTrend(
  values: number[],
  consecutive = 2,
): AnomalyResult | null {
  if (values.length < consecutive + 1) return null;

  const recent = values.slice(-(consecutive + 1));
  let isDecreasing = true;
  let isIncreasing = true;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i] >= recent[i - 1]) isDecreasing = false;
    if (recent[i] <= recent[i - 1]) isIncreasing = false;
  }

  if (!isDecreasing && !isIncreasing) return null;

  const totalChange =
    ((recent[recent.length - 1] - recent[0]) / Math.abs(recent[0])) * 100;

  if (Math.abs(totalChange) < 5) return null; // 忽略 <5% 的变化

  const direction = isDecreasing ? "下降" : "上升";
  return {
    type: "anomaly",
    severity: Math.abs(totalChange) > 20 ? "high" : "medium",
    title: `连续 ${consecutive} 期${direction}`,
    description: `连续 ${recent.length - 1} 个周期持续${direction}, 累计变化 ${totalChange.toFixed(1)}%`,
    evidence: { values: recent, totalChange, consecutive },
    suggestion: isDecreasing
      ? "建议排查下降原因, 评估是否需要干预"
      : "建议分析上升驱动因素, 评估可持续性",
  };
}
