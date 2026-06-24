import { useState } from "react";
import { Trash2, MessageSquare } from "lucide-react";
import type { ChatSession } from "../../../../types/chat";
import { formatRelative } from "../../utils/formatRelative";

interface SessionItemProps {
  session: ChatSession;
  active: boolean;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
}

export function SessionItem({
  session,
  active,
  onSelect,
  onRequestDelete,
}: SessionItemProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
      style={{
        background: active ? "var(--bg-hover)" : hover ? "var(--bg-tertiary)" : "transparent",
        color: "var(--text-primary)",
        borderLeft: active
          ? "3px solid var(--accent)"
          : "3px solid transparent",
      }}
    >
      <MessageSquare
        size={14}
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {session.title || "新对话"}
        </div>
        <div
          className="truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          {formatRelative(session.updatedAt)}
        </div>
      </div>
      <button
        aria-label="删除会话"
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete(session.id);
        }}
        className={`flex h-6 w-6 items-center justify-center rounded transition-opacity ${
          hover || active ? "opacity-100" : "opacity-0"
        }`}
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--error)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
