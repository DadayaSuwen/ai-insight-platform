/**
 * [Fix-4 Task 4.8] DashboardGenerator 模块单元测试
 *
 * 注意: generator.controller.ts 顶层 import 链含 kysely, 切断后只测
 * **纯 Zod schema 逻辑**: ExecuteSchema (Fix-2 Task 2.1 引入).
 *
 * 验证:
 *   - 安全 identifier 白名单 (table / groupBy / timeField 必须是 ASCII)
 *   - limit 范围 1-1000
 *   - range 可选且任意字符串
 */
import { z } from 'zod';

// 镜像 generator.controller.ts 的 ExecuteSchema (Fix-2 Task 2.1)
const ExecuteSchema = z.object({
  datasourceId: z.string().min(1),
  table: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'table 必须是安全标识符'),
  metric: z.string().min(1).max(120),
  groupBy: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
  timeField: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
  range: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

describe('Dashboard ExecuteSchema (Fix-2 Task 2.1)', () => {
  it('应该接受合法 table + metric', () => {
    const r = ExecuteSchema.safeParse({
      datasourceId: 'ds-1',
      table: 'orders',
      metric: 'total_amt',
    });
    expect(r.success).toBe(true);
  });

  it('应该接受带 groupBy / timeField / range / limit 的完整请求', () => {
    const r = ExecuteSchema.safeParse({
      datasourceId: 'ds-1',
      table: 'orders',
      metric: 'total_amt',
      groupBy: 'category',
      timeField: 'created_at',
      range: '30d',
      limit: 100,
    });
    expect(r.success).toBe(true);
  });

  it('应该拒绝含特殊字符的 table (SQL 注入防护)', () => {
    const r = ExecuteSchema.safeParse({
      datasourceId: 'ds-1',
      table: 'orders; DROP TABLE users--',
      metric: 'total_amt',
    });
    expect(r.success).toBe(false);
  });

  it('应该拒绝含中文的 groupBy (Fix-1 之后允许 LLM 输出中文, 但 ExecuteSchema 仍只接 ASCII)', () => {
    const r = ExecuteSchema.safeParse({
      datasourceId: 'ds-1',
      table: 'orders',
      metric: 'total_amt',
      groupBy: '类别',
    });
    expect(r.success).toBe(false);
  });

  it('应该拒绝 limit 超过 1000', () => {
    const r = ExecuteSchema.safeParse({
      datasourceId: 'ds-1',
      table: 'orders',
      metric: 'total_amt',
      limit: 9999,
    });
    expect(r.success).toBe(false);
  });

  it('应该拒绝 limit < 1', () => {
    const r = ExecuteSchema.safeParse({
      datasourceId: 'ds-1',
      table: 'orders',
      metric: 'total_amt',
      limit: 0,
    });
    expect(r.success).toBe(false);
  });
});
