import { Test, TestingModule } from '@nestjs/testing';
import { SqlAgent } from './sql.agent';

describe('SqlAgent', () => {
  let agent: SqlAgent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SqlAgent],
    }).compile();

    agent = module.get<SqlAgent>(SqlAgent);
  });

  describe('generate', () => {
    /**
     * Test case: Category query
     * Given: User asks for sales by category
     * Expected: Return SQL with GROUP BY category
     */
    it('should generate SQL for category query', async () => {
      const sql = await agent.generate('按类别显示销售额');
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('"category"');
    });

    /**
     * Test case: Region query
     * Given: User asks for sales by region
     * Expected: Return SQL with GROUP BY region
     */
    it('should generate SQL for region query', async () => {
      const sql = await agent.generate('显示各地区销售');
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('"region"');
    });

    /**
     * Test case: Time/Date trend query
     * Given: User asks for trend over time
     * Expected: Return SQL with DATE function
     */
    it('should generate SQL for time trend', async () => {
      const sql = await agent.generate('显示销售趋势');
      expect(sql).toContain('DATE(');
      expect(sql).toContain('saleDate');
    });

    /**
     * Test case: Product query
     * Given: User asks for product data
     * Expected: Return SELECT with productName
     */
    it('should generate SQL for product query', async () => {
      const sql = await agent.generate('显示产品销售');
      expect(sql).toContain('"productName"');
    });

    /**
     * Test case: Total/Sum query
     * Given: User asks for total
     * Expected: Return SQL with SUM function
     */
    it('should generate SQL for total', async () => {
      const sql = await agent.generate('销售总数是多少');
      expect(sql).toContain('SUM(');
    });

    /**
     * Test case: Average query
     * Given: User asks for average
     * Expected: Return SQL with AVG function
     */
    it('should generate SQL for average', async () => {
      const sql = await agent.generate('平均销售额');
      expect(sql).toContain('AVG(');
    });

    /**
     * Test case: Recent data query
     * Given: User asks for recent data (without sales keyword)
     * Expected: Return SQL with ORDER BY DESC
     */
    it('should generate SQL for recent data', async () => {
      const sql = await agent.generate('最近的数据');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('DESC');
    });

    /**
     * Test case: Top N query
     * Given: User asks for top products
     * Expected: Return SQL with LIMIT
     */
    it('should generate SQL with LIMIT for top query', async () => {
      const sql = await agent.generate('销售最好的产品');
      expect(sql).toContain('LIMIT');
    });

    /**
     * Test case: Default safe query
     * Given: Unknown query
     * Expected: Return safe default SELECT with LIMIT
     */
    it('should return safe default query', async () => {
      const sql = await agent.generate('随便给点数据');
      expect(sql).toContain('SELECT');
      expect(sql).toContain('LIMIT');
    });

    /**
     * Test case: English queries
     * Given: User uses English
     * Expected: Still generate correct SQL
     */
    it('should handle English queries', async () => {
      const sql = await agent.generate('show sales by category');
      expect(sql).toContain('GROUP BY');
    });
  });

  /**
   * Test case: SQL injection prevention
   */
  describe('security', () => {
    it('should only generate SELECT statements', async () => {
      const sql = await agent.generate('任何查询');
      const upperSQL = sql.toUpperCase().trim();
      expect(upperSQL.startsWith('SELECT')).toBe(true);
      expect(upperSQL.includes('DROP')).toBe(false);
      expect(upperSQL.includes('DELETE')).toBe(false);
      expect(upperSQL.includes('INSERT')).toBe(false);
      expect(upperSQL.includes('UPDATE')).toBe(false);
      expect(upperSQL.includes('TRUNCATE')).toBe(false);
    });

    it('should use quoted identifiers', async () => {
      const sql = await agent.generate('查询');
      expect(sql).toContain('"Sales"');
    });
  });

  /**
   * Test case: Edge cases
   */
  describe('edge cases', () => {
    it('should handle empty message', async () => {
      const sql = await agent.generate('');
      expect(sql).toContain('SELECT');
    });

    it('should handle special characters', async () => {
      const sql = await agent.generate('查询#销售@数据!');
      expect(sql).toContain('SELECT');
    });
  });
});