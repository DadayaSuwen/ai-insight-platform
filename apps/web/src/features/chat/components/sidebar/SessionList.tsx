import { useMemo } from "react";
import { useChatStore } from "../../store";
import { SessionItem } from "./SessionItem";

interface SessionListProps {
  onSelect: (id: string) => void;
  /** 行内"确认删除"按钮回调（不再走 modal） */
  onConfirmDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
}

export function SessionList({ onSelect, onConfirmDelete, onRename }: SessionListProps) {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessionsLoading = useChatStore((s) => s.sessionsLoading);
  const searchQuery = useChatStore((s) => s.searchQuery);

  // 按 title 模糊匹配（toLowerCase 双边，中文不受影响）
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title || "").toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  if (sessionsLoading && sessions.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-2 py-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 w-full animate-pulse rounded-md"
            style={{ background: "var(--bg-tertiary)" }}
          />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div
        className="px-4 py-6 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        还没有对话
        <br />
        点击「新建对话」开始
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div
        className="px-4 py-6 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        没有匹配「{searchQuery}」的会话
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2">
      {filtered.map((s) => (
        <SessionItem
          key={s.id}
          session={s}
          active={s.id === currentSessionId}
          onSelect={onSelect}
          onConfirmDelete={onConfirmDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}