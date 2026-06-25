import { useChatStore } from "../../store";
import { SessionItem } from "./SessionItem";

interface SessionListProps {
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
}

export function SessionList({ onSelect, onRequestDelete, onRename }: SessionListProps) {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessionsLoading = useChatStore((s) => s.sessionsLoading);

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

  return (
    <div className="flex flex-col gap-1 px-2">
      {sessions.map((s) => (
        <SessionItem
          key={s.id}
          session={s}
          active={s.id === currentSessionId}
          onSelect={onSelect}
          onRequestDelete={onRequestDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}
