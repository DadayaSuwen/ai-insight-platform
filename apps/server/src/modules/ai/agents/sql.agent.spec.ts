import { Test, TestingModule } from '@nestjs/testing';
import { SqlAgent } from './sql.agent';
import { LlmService } from '../llm/llm.service';
import { createLlmMock } from '../llm/llm.mock';

describe('SqlAgent', () => {
  let agent: SqlAgent;
  let llmMock: ReturnType<typeof createLlmMock>;

  beforeEach(async () => {
    llmMock = createLlmMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqlAgent,
        { provide: LlmService, useValue: llmMock },
      ],
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

  /**
   * LLM success path. When Ollama returns valid SELECT, the agent
   * should pass it through; when it returns unsafe or unparsable
   * text, the agent falls back to the template.
   */
  describe('LLM path', () => {
    it('should accept a plain SELECT from the LLM', async () => {
      llmMock.invoke.mockResolvedValue(
        'SELECT "category", SUM("amount") AS total FROM "Sales" GROUP BY "category"',
      );
      const sql = await agent.generate('show me category totals');
      expect(sql).toContain('SELECT');
      expect(sql).toContain('Sales');
      expect(llmMock.invoke).toHaveBeenCalledTimes(1);
    });

    it('should strip markdown fences from LLM output', async () => {
      llmMock.invoke.mockResolvedValue(
        '```sql\nSELECT * FROM "Sales" LIMIT 5;\n```',
      );
      const sql = await agent.generate('give me some rows');
      expect(sql.startsWith('SELECT')).toBe(true);
      expect(sql).not.toContain('```');
    });

    it('should reject non-SELECT SQL from the LLM and fall back', async () => {
      llmMock.invoke.mockResolvedValue('DROP TABLE "Sales";');
      const sql = await agent.generate('wipe everything');
      // DROP is forbidden → falls back to safe SELECT template
      expect(sql.toUpperCase().trim().startsWith('SELECT')).toBe(true);
      expect(sql).not.toContain('DROP');
    });

    it('should reject INSERT from the LLM and fall back', async () => {
      llmMock.invoke.mockResolvedValue(
        'INSERT INTO "Sales" VALUES (1, 2, 3, 4, 5, 6);',
      );
      const sql = await agent.generate('add a row');
      expect(sql.toUpperCase().trim().startsWith('SELECT')).toBe(true);
    });

    it('should fall back when LLM throws', async () => {
      llmMock.invoke.mockRejectedValue(new Error('LLM timeout after 30000ms'));
      const sql = await agent.generate('按类别显示销售额');
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('"category"');
    });
  });
});