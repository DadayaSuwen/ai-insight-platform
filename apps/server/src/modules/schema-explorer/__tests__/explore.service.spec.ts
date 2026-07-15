/**
 * [Fix-4 Task 4.6] SchemaExplorer 模块单元测试
 *
 * 注意: explore.service.ts 顶层 import 链含 kysely (ESM-only),
 * jest CJS 在严格 commonjs tsconfig 下无法直接 load (仓库基线).
 *
 * 用 jest.mock 切断 kysely 加载链, 仅跑纯函数逻辑验证.
 * - inferRelations 是 ExploreService 内部纯函数, 通过 prototype 调用
 *   不触发 ctor 的依赖注入
 */
import { ExploreService } from '../explore.service';

// 切断 explore.service.ts 的 import 链, 避免触发 kysely ESM
jest.mock('../../datasource/datasource.service', () => ({
  DatasourceService: class {},
}));
jest.mock('../../datasource/metadata/metadata.service', () => ({
  MetadataService: class {},
}));
jest.mock('../../datasource/metadata/semantic-inference.service', () => ({
  SemanticInferenceService: class {},
}));
jest.mock('../../datasource/executors/executor.factory', () => ({
  ExecutorFactory: class {},
}));
jest.mock('../../database/database.service', () => ({
  DatabaseService: class {},
}));

describe('ExploreService.inferRelations (pure)', () => {
  // 不 new ExploreService, 直接拿 prototype 上的方法
  const service = Object.create(ExploreService.prototype) as ExploreService;
  const inferRelations = (service as unknown as {
    inferRelations: (
      tables: Array<{ name: string; columns: string[] }>,
    ) => Array<{ from: string; to: string; confidence: number }>;
  }).inferRelations.bind(service);

  it('应该推断 xxx_id → xxx 表的 1:N 关系', () => {
    const relations = inferRelations([
      { name: 'customers', columns: ['id', 'name'] },
      { name: 'orders', columns: ['id', 'customer_id', 'total'] },
    ]);
    const found = relations.find(
      (r) => r.from === 'orders.customer_id' && r.to === 'customers',
    );
    expect(found).toBeDefined();
    expect(found?.confidence).toBe(0.8);
  });

  it('无 id 关联列时不应输出关系', () => {
    const relations = inferRelations([
      { name: 'logs', columns: ['id', 'message'] },
      { name: 'tags', columns: ['id', 'name'] },
    ]);
    expect(relations).toEqual([]);
  });

  it('复数表名 customer → customers 也能匹配', () => {
    const relations = inferRelations([
      { name: 'customers', columns: ['id'] },
      { name: 'orders', columns: ['id', 'customer_id'] },
    ]);
    const found = relations.find((r) => r.to === 'customers');
    expect(found).toBeDefined();
  });
});
