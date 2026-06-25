import { useState, useEffect, useRef } from "react";
import { Trash2, MessageSquare, Pencil } from "lucide-react";
import type { ChatSession } from "../../../../types/chat";
import { formatRelative } from "../../utils/formatRelative";

interface SessionItemProps {
  session: ChatSession;
  active: boolean;
  onSelect: (id: string) => void;
  /** 触发删除二次确认（Commit 3 之前：弹 modal；之后：inline 展开） */
  onRequestDelete: (id: string) => void;
  /** 重命名提交（乐观更新 + 失败回滚在 hook 里处理） */
  onRename: (id: string, title: string) => Promise<boolean>;
}

export function SessionItem({
  session,
  active,
  onSelect,
  onRequestDelete,
  onRename,
}: SessionItemProps) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入编辑态后自动 focus + 选中
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = async () => {
    if (!editing) return;
    const newTitle = draft.trim();
    setEditing(false);
    if (newTitle && newTitle !== session.title) {
      await onRename(session.id, newTitle);
    }
  };

  const cancel = () => {
    setDraft(session.title);
    setEditing(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => {
        if (!editing) onSelect(session.id);
      }}
      onKeyDown={(e) => {
        if (editing) return;
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
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="w-full rounded border px-1 py-0.5 text-sm outline-none"
            style={{
              borderColor: "var(--accent)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
          />
        ) : (
          <div
            className="truncate text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(session.title);
              setEditing(true);
            }}
            title="双击重命名"
          >
            {session.title || "新对话"}
          </div>
        )}
        <div
          className="truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          {formatRelative(session.updatedAt)}
        </div>
      </div>

      {/* 铅笔图标：hover/active 时显示，点击进入编辑态 */}
      {!editing && (
        <button
          aria-label="重命名会话"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(session.title);
            setEditing(true);
          }}
          className={`flex h-6 w-6 items-center justify-center rounded transition-opacity ${
            hover || active ? "opacity-100" : "opacity-0"
          }`}
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <Pencil size={12} />
        </button>
      )}

      {/* 垃圾桶：hover/active 时显示，触发父组件的二次确认流程（modal 或 inline） */}
      {!editing && (
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
      )}
    </div>
  );
}