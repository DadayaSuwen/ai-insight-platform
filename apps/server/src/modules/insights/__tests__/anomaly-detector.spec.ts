/**
 * [Fix-4 Task 4.9] Insights 模块单元测试
 *
 * 覆盖 anomaly-detector.ts 的纯函数 (无外部依赖):
 *   - detectZScoreAnomaly
 *   - detectChangeRate
 *   - detectTrend
 */
import {
  detectZScoreAnomaly,
  detectChangeRate,
  detectTrend,
} from '../anomaly-detector';

describe('detectZScoreAnomaly', () => {
  it('数据点少于 3 个时返回空数组', () => {
    expect(detectZScoreAnomaly([1, 2])).toEqual([]);
    expect(detectZScoreAnomaly([])).toEqual([]);
  });

  it('标准差为 0 (全等值) 时返回空数组', () => {
    expect(detectZScoreAnomaly([5, 5, 5, 5])).toEqual([]);
  });

  it('最近值显著高于均值时返回 opportunity 类型', () => {
    // 5 个 0 + 1 个 1000: z-score > 2 触发, type=opportunity, severity=medium
    const r = detectZScoreAnomaly([0, 0, 0, 0, 0, 1000]);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].type).toBe('opportunity');
    expect(['medium', 'high']).toContain(r[0].severity);
  });

  it('最近值显著低于均值时返回 risk 类型', () => {
    // 6 个 1 + 1 个 -1000: mean≈-141.4, stddev≈331, z≈-2.59 (> 2 触发)
    const r = detectZScoreAnomaly([1, 1, 1, 1, 1, 1, -1000]);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].type).toBe('risk');
  });
});

describe('detectChangeRate', () => {
  it('previous 为 0 时返回 null (避免除零)', () => {
    expect(detectChangeRate(10, 0)).toBeNull();
  });

  it('变化 < 阈值时返回 null', () => {
    expect(detectChangeRate(105, 100, 0.3)).toBeNull();
  });

  it('上升超过 30% 时返回 opportunity', () => {
    // 100 → 200 = 100% 变化 (> 0.5, severity=high)
    const r = detectChangeRate(200, 100, 0.3);
    expect(r).not.toBeNull();
    expect(r?.type).toBe('opportunity');
    expect(r?.severity).toBe('high');
  });

  it('下降超过 30% 时返回 risk', () => {
    const r = detectChangeRate(50, 100, 0.3);
    expect(r).not.toBeNull();
    expect(r?.type).toBe('risk');
  });
});

describe('detectTrend', () => {
  it('数据点不足时返回 null', () => {
    expect(detectTrend([1, 2])).toBeNull();
  });

  it('连续 3 期下降时返回 anomaly 类型', () => {
    const r = detectTrend([100, 90, 80, 70]);
    expect(r).not.toBeNull();
    expect(r?.type).toBe('anomaly');
    expect(r?.title).toContain('下降');
  });

  it('连续 3 期上升时返回 anomaly 类型', () => {
    const r = detectTrend([10, 20, 30, 40]);
    expect(r).not.toBeNull();
    expect(r?.type).toBe('anomaly');
    expect(r?.title).toContain('上升');
  });

  it('震荡数据不应触发趋势', () => {
    expect(detectTrend([10, 20, 10, 20, 10])).toBeNull();
  });
});
