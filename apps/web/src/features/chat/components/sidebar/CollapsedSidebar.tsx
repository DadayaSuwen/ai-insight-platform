import { useState } from "react";
import { Plus, ChevronRight, MessageCircle, Loader2 } from "lucide-react";
import { useChatStore } from "../../store";
import { useChatActions } from "../../hooks/useChatActions";
import { formatRelative } from "../../utils/formatRelative";
import { cn } from "../../../../lib/utils";

/**
 * Narrow icon-strip variant of the sidebar (desktop, when sidebarCollapsed=true).
 *
 * Layout:
 *   ┌────┐
 *   │ 💬 │  logo / expand toggle
 *   │ ＋ │  new chat
 *   │ ── │
 *   │ ●  │  active session
 *   │ ●  │
 *   │ ●  │
 *   │ ── │
 *   │ ▶  │  expand toggle
 *   └────┘
 *
 * 注意：折叠态没有列表行可放 inline 展开，所以右键菜单彻底移除。
 * 要删除会话请先展开侧栏。
 */
export function CollapsedSidebar() {
  const { handleNewChat, selectSession } = useChatActions();
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const setSidebarCollapsed = useChatStore((s) => s.setSidebarCollapsed);
  const [loading, setLoading] = useState(false);

  return (
    <aside className="flex h-full w-[56px] shrink-0 flex-col items-center bg-surface border-r border-default">
      {/* Logo / expand button */}
      <div className="flex shrink-0 items-center justify-center border-b py-3 border-default">
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label="展开侧边栏"
          title="展开侧边栏"
          className="flex h-9 w-9 items-center justify-center rounded-md transition-colors bg-accent hover:bg-accent-hover"
        >
          <MessageCircle size={16} className="text-inverse" />
        </button>
      </div>

      {/* New chat */}
      <div className="py-2">
        <button
          onClick={async () => {
            if (loading) return;
            setLoading(true);
            try {
              await handleNewChat();
            } finally {
              setLoading(false);
            }
          }}
          aria-label="新建对话"
          title="新建对话"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md transition-colors text-secondary hover:bg-hover-custom",
            loading && "opacity-50",
          )}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
        </button>
      </div>

      {/* Session dots */}
      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 py-1">
        {sessions.map((s) => {
          const active = s.id === currentSessionId;
          const initial = (s.title || "新对话").trim().charAt(0).toUpperCase();
          return (
            <button
              key={s.id}
              onClick={() => selectSession(s.id, {})}
              aria-label={s.title || "新对话"}
              title={`${s.title || "新对话"} · ${formatRelative(s.updatedAt)}\n（左键切换 · 展开侧栏后可删除/重命名）`}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                active
                  ? "bg-[var(--accent-light)] text-accent border border-accent"
                  : "bg-subtle text-secondary border border-transparent hover:bg-hover-custom",
              )}
            >
              {initial}
            </button>
          );
        })}
      </div>

      {/* Expand button at bottom */}
      <div className="flex shrink-0 items-center justify-center border-t py-2 border-default">
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label="展开侧边栏"
          title="展开"
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors text-muted hover:bg-hover-custom hover:text-default"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </aside>
  );
}