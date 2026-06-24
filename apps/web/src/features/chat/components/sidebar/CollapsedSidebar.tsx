import { useState } from "react";
import { Plus, ChevronRight, MessageCircle, Loader2 } from "lucide-react";
import { useChatStore } from "../../store";
import { useChatActions } from "../../hooks/useChatActions";
import { DeleteSessionDialog } from "./DeleteSessionDialog";
import { formatRelative } from "../../utils/formatRelative";

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
 */
export function CollapsedSidebar() {
  const { handleNewChat, selectSession, handleDelete } = useChatActions();
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const setSidebarCollapsed = useChatStore((s) => s.setSidebarCollapsed);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  return (
    <aside
      className="flex h-full w-[56px] shrink-0 flex-col items-center"
      style={{
        background: "var(--bg-primary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo / expand button */}
      <div
        className="flex shrink-0 items-center justify-center border-b py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label="展开侧边栏"
          title="展开侧边栏"
          className="flex h-9 w-9 items-center justify-center rounded-md transition-colors"
          style={{ background: "var(--accent)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--accent-hover)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <MessageCircle size={16} style={{ color: "var(--text-inverse)" }} />
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
          className="flex h-9 w-9 items-center justify-center rounded-md transition-colors"
          style={{
            color: "var(--text-secondary)",
            opacity: loading ? 0.5 : 1,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
              onContextMenu={(e) => {
                e.preventDefault();
                setPendingDelete({ id: s.id, title: s.title });
              }}
              aria-label={s.title || "新对话"}
              title={`${s.title || "新对话"} · ${formatRelative(s.updatedAt)}\n（左键切换 / 右键删除）`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors"
              style={{
                background: active ? "var(--accent-light)" : "var(--bg-tertiary)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                border: active
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
            >
              {initial}
            </button>
          );
        })}
      </div>

      {/* Expand button at bottom */}
      <div
        className="flex shrink-0 items-center justify-center border-t py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setSidebarCollapsed(false)}
          aria-label="展开侧边栏"
          title="展开"
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <DeleteSessionDialog
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? ""}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
        }}
      />
    </aside>
  );
}
