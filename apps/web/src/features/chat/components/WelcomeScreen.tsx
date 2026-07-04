import { Sparkles, ArrowRight } from "lucide-react";

/** Rotating greeting — different on each cold start so it feels alive. */
const GREETINGS = [
  "有什么我可以帮你的吗？",
  "今天想了解哪些数据？",
  "让我帮你挖掘数据中的洞察。",
  "准备好开始一次新的探索了吗？",
];

const pickGreeting = (i: number) => GREETINGS[i % GREETINGS.length];

export interface WelcomeScreenProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

/**
 * Gemini-style welcome screen. Rendered by ChatWindow when the current
 * session is empty and not loading history. Renders the greeting, the
 * composer (re-used shape), and a row of suggestion chips.
 */
function WelcomeScreen({ onSend, isLoading }: WelcomeScreenProps) {
  // Vary the greeting per cold start, but keep it stable for the lifetime
  // of this mount so it doesn't flicker on re-render.
  const greeting = pickGreeting(
    Math.floor((Date.now() / 1000 / 60 / 60) % GREETINGS.length),
  );

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-6"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        {/* Logo + Greeting */}
        <div className="flex flex-col items-center gap-3 text-center">
          {/* <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-md"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), var(--accent-hover))",
            }}
          >
            <Sparkles size={22} style={{ color: "var(--text-inverse)" }} />
          </div> */}
          <h1
            className="text-3xl font-semibold tracking-tight md:text-4xl"
            style={{ color: "var(--text-primary)" }}
          >
            你好，我是{" "}
            <span style={{ color: "var(--accent)" }}>AI Insight</span>
          </h1>
          <p
            className="max-w-md text-sm md:text-base"
            style={{ color: "var(--text-muted)" }}
          >
            {greeting}
            <br />
            试试用自然语言提问，我会自动查询数据库、生成图表并撰写分析报告。
          </p>
        </div>

        {/* Composer — inline prompt box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem("q") as HTMLInputElement;
            const text = input.value.trim();
            if (!text || isLoading) return;
            onSend(text);
            input.value = "";
          }}
          className="w-full"
        >
          <div
            className="flex items-center gap-2 rounded-full border px-4 py-2.5 shadow-sm transition-colors"
            style={{
              background: "var(--bg-primary)",
              borderColor: "var(--border)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--accent)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--border)")
            }
          >
            <input
              name="q"
              type="text"
              autoFocus
              disabled={isLoading}
              placeholder="问问 AI Insight"
              className="flex-1 bg-transparent text-base outline-none placeholder:text-[15px]"
              style={{ color: "var(--text-primary)" }}
            />
            <button
              type="submit"
              disabled={isLoading}
              aria-label="发送"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
                opacity: isLoading ? 0.5 : 1,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--accent-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--accent)")
              }
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </form>

        {/* Suggestion chips */}
        <div className="flex flex-col items-center gap-2.5">
          <p
            className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            推荐
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.query}
                disabled={isLoading}
                onClick={() => onSend(s.query)}
                className="rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const SUGGESTIONS: Array<{ label: string; query: string }> = [
  {
    label: "📊 本月销售总结与洞察",
    query: "帮我统计本月的总销售额、订单量和销量，并抽取几条商业洞察。",
  },
  {
    label: "🏆 Top 10 客户",
    query: "列出销售额最高的 10 个客户，并告诉我他们的利润贡献。",
  },
  {
    label: "💸 哪些产品最亏",
    query: "找出利润最低的 5 个产品子类，分析亏损原因。",
  },
  {
    label: "📈 月度销售趋势 + 可视化",
    query: "按月统计 2017 年的销售额,画折线图,给我一些趋势洞察。",
  },
];

export default WelcomeScreen;
