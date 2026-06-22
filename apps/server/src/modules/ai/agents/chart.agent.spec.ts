import { Test, TestingModule } from '@nestjs/testing';
import { ChartAgent, ChartType } from './chart.agent';

describe('ChartAgent', () => {
  let agent: ChartAgent;

  // Sample test data
  const mockSalesData = [
    { productName: 'Product A', category: 'Electronics', amount: 1000, quantity: 10, region: 'North' },
    { productName: 'Product B', category: 'Electronics', amount: 1500, quantity: 5, region: 'South' },
    { productName: 'Product C', category: 'Clothing', amount: 500, quantity: 20, region: 'North' },
    { productName: 'Product D', category: 'Clothing', amount: 300, quantity: 15, region: 'South' },
    { productName: 'Product E', category: 'Food', amount: 200, quantity: 50, region: 'East' },
  ];

  const mockCategoryData = [
    { category: 'Electronics', total: 2500 },
    { category: 'Clothing', total: 800 },
    { category: 'Food', total: 200 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChartAgent],
    }).compile();

    agent = module.get<ChartAgent>(ChartAgent);
  });

  describe('generate', () => {
    /**
     * Test case: Generate bar chart
     * Given: User requests bar chart visualization
     * Expected: Return ECharts config with type 'bar'
     */
    it('should generate bar chart', async () => {
      const chart = await agent.generate(mockSalesData, '显示柱状图');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'bar');
    });

    /**
     * Test case: Generate line chart for trends
     * Given: User requests trend visualization
     * Expected: Return ECharts config with type 'line'
     */
    it('should generate line chart for trends', async () => {
      const chart = await agent.generate(mockSalesData, '显示趋势图');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'line');
    });

    /**
     * Test case: Generate pie chart for proportions
     * Given: User requests pie chart
     * Expected: Return ECharts config with type 'pie'
     */
    it('should generate pie chart for proportions', async () => {
      const chart = await agent.generate(mockCategoryData, '显示占比饼图');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'pie');
    });

    /**
     * Test case: Generate scatter chart
     * Given: User requests scatter plot
     * Expected: Return ECharts config with type 'scatter'
     */
    it('should generate scatter chart', async () => {
      const chart = await agent.generate(mockSalesData, '显示散点图');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'scatter');
    });

    /**
     * Test case: Generate area chart
     * Given: User requests area chart
     * Expected: Return ECharts config with type 'area'
     */
    it('should generate area chart', async () => {
      const chart = await agent.generate(mockSalesData, '显示面积图');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'area');
    });

    /**
     * Test case: Default to bar chart
     * Given: No specific chart type requested
     * Expected: Return default bar chart
     */
    it('should default to bar chart', async () => {
      const chart = await agent.generate(mockSalesData, '显示图表');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'bar');
    });
  });

  /**
   * Test case: Chart structure validation
   */
  describe('chart structure', () => {
    it('should include tooltip in config', async () => {
      const chart = await agent.generate(mockSalesData, '显示图表');
      expect(chart.tooltip).toBeDefined();
    });

    it('should include xAxis for category charts', async () => {
      const chart = await agent.generate(mockSalesData, '显示图表');
      expect(chart.xAxis).toBeDefined();
      expect(chart.xAxis).toHaveProperty('type', 'category');
    });

    it('should include yAxis for category charts', async () => {
      const chart = await agent.generate(mockSalesData, '显示图表');
      expect(chart.yAxis).toBeDefined();
      expect(chart.yAxis).toHaveProperty('type', 'value');
    });

    it('should include legend for pie chart', async () => {
      const chart = await agent.generate(mockCategoryData, '显示饼图');
      expect(chart.legend).toBeDefined();
    });

    it('should include data in series', async () => {
      const chart = await agent.generate(mockSalesData, '显示图表');
      expect(chart.series?.[0]).toHaveProperty('data');
      expect((chart.series?.[0] as { data: unknown[] }).data).toHaveLength(5);
    });
  });

  /**
   * Test case: Edge cases
   */
  describe('edge cases', () => {
    it('should handle empty data', async () => {
      const chart = await agent.generate([], '显示图表');
      expect(chart.series).toBeDefined();
      expect(chart.series?.[0]).toHaveProperty('type', 'bar');
    });

    it('should handle null data', async () => {
      const chart = await agent.generate([null] as unknown as unknown[], '显示图表');
      expect(chart.series).toBeDefined();
    });

    it('should handle single row data', async () => {
      const chart = await agent.generate([mockSalesData[0]], '显示图表');
      expect(chart.series).toBeDefined();
      expect((chart.series?.[0] as { data: unknown[] }).data).toHaveLength(1);
    });

    it('should handle missing columns gracefully', async () => {
      const chart = await agent.generate([{ unknown: 'value' }], '显示图表');
      expect(chart.series).toBeDefined();
    });
  });

  /**
   * Test case: English keywords
   */
  describe('English keywords', () => {
    it('should recognize bar keyword', async () => {
      const chart = await agent.generate(mockSalesData, 'show bar chart');
      expect(chart.series?.[0]).toHaveProperty('type', 'bar');
    });

    it('should recognize line keyword', async () => {
      const chart = await agent.generate(mockSalesData, 'show line chart');
      expect(chart.series?.[0]).toHaveProperty('type', 'line');
    });

    it('should recognize pie keyword', async () => {
      const chart = await agent.generate(mockSalesData, 'show pie chart');
      expect(chart.series?.[0]).toHaveProperty('type', 'pie');
    });
  });
});