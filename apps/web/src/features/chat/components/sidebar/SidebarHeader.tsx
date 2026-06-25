import { Search } from "lucide-react";
import { useChatStore } from "../../store";
import { NewChatButton } from "./NewChatButton";

export function SidebarHeader() {
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  return (
    <div
      className="flex shrink-0 flex-col gap-3 border-b p-3"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          AI Insight
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          多轮对话
        </div>
      </div>
      <NewChatButton />
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="search"
          placeholder="搜索会话…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border py-1 pl-7 pr-2 text-xs outline-none transition-colors"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>
    </div>
  );
}