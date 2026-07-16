/**
 * [Fix-4 Task 4.7] SchemaReview 模块单元测试
 *
 * 注意: review.service.ts 顶层 import 链含 kysely, 切断 kysely 加载
 * 后只测**纯逻辑**: columnAlias 持久化结构 (Fix-1 Task 1.4 引入).
 *
 * 验证:
 *   - 旧格式 (字符串 chineseName) 兼容
 *   - 新格式 ({chineseName, role, description}) 解析
 *   - role 必须是 4 个允许值之一 (联合类型收窄)
 */
import { z } from 'zod';

// 镜像 metadata.service.ts 中的列别名 schema (Fix-1 Task 1.4 改动)
const ColumnAliasSchema = z.union([
  z.string(),
  z.object({
    chineseName: z.string().optional(),
    role: z.enum(['dimension', 'measure', 'time', 'identifier']).optional(),
    description: z.string().optional(),
  }),
]);

describe('ColumnAlias (Fix-1 Task 1.4 schema)', () => {
  it('应该接受旧格式: 纯字符串 chineseName', () => {
    const r = ColumnAliasSchema.safeParse('订单状态');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toBe('订单状态');
    }
  });

  it('应该接受新格式: {chineseName, role, description}', () => {
    const r = ColumnAliasSchema.safeParse({
      chineseName: '订单状态',
      role: 'dimension',
      description: '标识订单当前所处状态',
    });
    expect(r.success).toBe(true);
  });

  it('应该接受空对象 (兼容历史空 alias)', () => {
    const r = ColumnAliasSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('应该拒绝非法 role 值', () => {
    const r = ColumnAliasSchema.safeParse({
      chineseName: 'x',
      role: 'unknown_role',
    });
    expect(r.success).toBe(false);
  });

  it('应该拒绝数字类型', () => {
    const r = ColumnAliasSchema.safeParse(123);
    expect(r.success).toBe(false);
  });
});
