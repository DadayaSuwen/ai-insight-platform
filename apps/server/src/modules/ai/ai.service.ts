import { Injectable } from '@nestjs/common';
import { RouterAgent } from './agents/router.agent';
import { SqlAgent } from './agents/sql.agent';
import { ChartAgent } from './agents/chart.agent';
import { AnalysisAgent } from './agents/analysis.agent';

@Injectable()
export class AiService {
  constructor(
    private readonly routerAgent: RouterAgent,
    private readonly sqlAgent: SqlAgent,
    private readonly chartAgent: ChartAgent,
    private readonly analysisAgent: AnalysisAgent,
  ) {}

  async process(message: string): Promise<void> {
    // TODO: Implement AI processing pipeline
  }
}