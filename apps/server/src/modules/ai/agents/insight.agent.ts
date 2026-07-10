import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { LlmService } from "../llm/llm.service";

// ============================================================
// Insight 输出 schema (LLM 严格按这个出 JSON)
// ============================================================
const InsightItemSchema = z.object({
  title: z.string().describe("6-12 字短语,直接点出洞察主题"),
  detail: z.string().describe("2-3 句分析,引用具体数字/占比,不要泛泛而谈"),
  severity: z.enum(["info", "warning", "opportunity", "risk"]),
  evidence: z
    .string()
    .optional()
    .describe("1 行数据点,如 '11 月利润环比 -23%' 或 '华北区占 38%'"),
});

export const InsightResultSchema = z.object({
  summary: z
    .string()
    .describe("一句话总结 (20-50 字),像电梯演讲开头:整体表现一句话定性"),
  insights: z
    .array(InsightItemSchema)
    .min(1)
    .max(5)
    .describe("1-5 条结构化洞察,聚焦商业价值,不简单复述数字"),
  recommendation: z
    .string()
    .optional()
    .describe("1 条可执行建议 (可选)"),
});

export type InsightResult = z.infer<typeof InsightResultSchema>;

// ============================================================
// System prompt - 资深商业分析师人设
// ============================================================
const INSIGHT_SYSTEM_PROMPT = `你是一位资深的商业数据分析师,服务对象是企业高管。

输入:用户问题 + 一个结构化的数据集(可能来自 SQL 聚合、Top-N、或图表数据)。

任务:抽取 **3-5 条有商业价值** 的洞察,而非简单复述数字。

【输出格式】
严格 JSON,匹配 schema:
{
  "summary":   一句话总结(20-50 字,定性整体表现),
  "insights":  3-5 条洞察,每条:
    - title:     6-12 字短语,直接点题 (例: "利润下滑隐忧"、"办公用品占比偏低")
    - detail:    2-3 句,引用具体数字与对比 (例: "11 月利润 12 万元,环比下降 23%,远高于销售额 5% 的降幅,说明折扣策略在侵蚀利润")
    - severity:  info(中性观察) | warning(需关注) | opportunity(增长机会) | risk(明确风险)
    - evidence:  1 行关键数据点 (例: "11 月利润 -23% MoM")
  "recommendation": 1 条可执行建议(可选)
}

【聚焦方向 (挑 1-2 个,不要全堆)】
- 趋势: 上升 / 下降 / 拐点 / 季节性
- 异常: 离群点、暴增暴减、与大盘背离的子项
- 机会: 高速增长但占比低的细分、利润率高于均值的品类
- 风险: 亏损子项、过度依赖单一客户/地区、利润率持续下滑
- 对比: 跨维度的差异、客户类型差异、地区差异

【原则】
1. 引用具体数字。空话("表现良好"、"值得关注")禁止出现。
2. 区分相关性与因果性。不要把"数据相关"包装成"因为所以"。
3. severity 不要全选 warning。客观地选 info / opportunity / risk。
4. 如果数据量很小 (<3 行),老老实实说"样本量不足,无法识别趋势"。
5. 语言精炼、专业,像麦肯锡给 CEO 的简报。

【禁止】
- 不要 Markdown 表格
- 不要解释你的方法
- 不要"基于以上分析"这种废话开头`;

// ============================================================
// InsightAgent - 独立 Agent 类
// 专门做"数据 → 商业洞察"的二次 LLM pass
// ============================================================
@Injectable()
export class InsightAgent {
  private readonly logger = new Logger(InsightAgent.name);

  constructor(private readonly llm: LlmService) {}

  async generate(input: {
    question: string;
    data: unknown;
    focus?: "general" | "trend" | "anomaly" | "opportunity" | "risk" | null;
  }): Promise<InsightResult> {
    const focusHint =
      input.focus && input.focus !== "general"
        ? `\n本次分析聚焦方向: ${input.focus}`
        : "";

    // 截断数据防止 prompt 过长;对超大结果只取前 30 行
    const dataPreview = this.previewData(input.data);

    const userMsg = `用户问题: ${input.question}

数据集:
${dataPreview}${focusHint}

请按 schema 输出 JSON。`;

    try {
      const result = (await this.llm.invokeStructured({
        system: INSIGHT_SYSTEM_PROMPT,
        human: userMsg,
        schema: InsightResultSchema,
        temperature: 0.3,
        timeoutMs: 45_000,
      })) as InsightResult;
      this.logger.log(
        `Insight generated: ${result.insights.length} items, severity=${
          result.insights.map((i) => i.severity).join(",")
        }`,
      );
      return result;
    } catch (err) {
      // Fallback: LLM 输出异常,降级为最简结果(不抛错,前端能看到点东西)
      this.logger.warn(
        `InsightAgent LLM call failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        summary: "暂未能生成结构化洞察。",
        insights: [
          {
            title: "分析暂不可用",
            detail:
              "LLM 输出未能匹配预期 schema,建议换个问法或直接基于数据自行分析。",
            severity: "info",
          },
        ],
      };
    }
  }

  /**
   * 把数据转为 LLM 可读的紧凑格式，优先提取 rows 数组
   */
  private previewData(data: unknown): string {
    try {
      const obj = data as Record<string, unknown>;

      // [Sprint 5.7+] 如果数据含 rows 数组，直接格式化为紧凑表格
      if (Array.isArray(obj.rows) && obj.rows.length > 0) {
        const rows = obj.rows as Array<Record<string, unknown>>;
        const cols = Object.keys(rows[0]);
        const header = cols.join(" | ");
        const body = rows.slice(0, 30).map((r) =>
          cols.map((c) => String(r[c] ?? "")).join(" | "),
        );
        let text = `数据行数: ${rows.length}\n列: ${cols.join(", ")}\n${header}\n${"-".repeat(header.length)}\n${body.join("\n")}`;
        if (rows.length > 30) text += `\n... (共 ${rows.length} 行, 已截断)`;
        if (text.length > 6000) text = text.slice(0, 6000) + "\n... (已截断)";
        return text;
      }

      // 回退: JSON 序列化
      let json = JSON.stringify(data, null, 2);
      if (json.length > 6000) {
        json = json.slice(0, 6000) + "\n... (已截断)";
      }
      return json;
    } catch {
      return String(data).slice(0, 4000);
    }
  }
}