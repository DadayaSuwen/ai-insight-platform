import { Search } from "lucide-react";
import { useChatStore } from "../../store";
import { NewChatButton } from "./NewChatButton";

export function SidebarHeader() {
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b p-3 border-default">
      <div>
        <div className="text-sm font-semibold text-default">AI Insight</div>
        <div className="text-[11px] text-muted">多轮对话</div>
      </div>
      <NewChatButton />
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          placeholder="搜索会话…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border py-1 pl-7 pr-2 text-xs outline-none transition-colors border-default bg-muted text-default focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}