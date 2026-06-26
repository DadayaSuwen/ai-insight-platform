import { useState, useEffect, useRef } from "react";
import { Trash2, MessageSquare, Pencil } from "lucide-react";
import type { ChatSession } from "../../../../types/chat";
import { formatRelative } from "../../utils/formatRelative";

interface SessionItemProps {
  session: ChatSession;
  active: boolean;
  onSelect: (id: string) => void;
  /**
   * 删除确认回调。Commit 3 起不再走 modal，
   * 行内"确认/取消"按钮 + 3 秒自动撤回；父组件只需要真正删除的 action。
   */
  onConfirmDelete: (id: string) => void;
  /** 重命名提交（乐观更新 + 失败回滚在 hook 里处理） */
  onRename: (id: string, title: string) => Promise<boolean>;
}

const REVERT_MS = 3000;

export function SessionItem({
  session,
  active,
  onSelect,
  onConfirmDelete,
  onRename,
}: SessionItemProps) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const revertTimer = useRef<number | null>(null);

  // 进入编辑态后自动 focus + 选中
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // 卸载时清 timer，避免 setState on unmounted
  useEffect(() => {
    return () => {
      if (revertTimer.current !== null) {
        window.clearTimeout(revertTimer.current);
      }
    };
  }, []);

  const startConfirming = () => {
    setConfirming(true);
    if (revertTimer.current !== null) {
      window.clearTimeout(revertTimer.current);
    }
    revertTimer.current = window.setTimeout(() => {
      setConfirming(false);
      revertTimer.current = null;
    }, REVERT_MS);
  };

  const cancelConfirm = () => {
    setConfirming(false);
    if (revertTimer.current !== null) {
      window.clearTimeout(revertTimer.current);
      revertTimer.current = null;
    }
  };

  const commitRename = async () => {
    if (!editing) return;
    const newTitle = draft.trim();
    setEditing(false);
    if (newTitle && newTitle !== session.title) {
      await onRename(session.id, newTitle);
    }
  };

  const cancelRename = () => {
    setDraft(session.title);
    setEditing(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => {
        if (!editing && !confirming) onSelect(session.id);
      }}
      onKeyDown={(e) => {
        if (editing || confirming) return;
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
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
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

      {/* 编辑中只显示 input，按钮隐藏 */}
      {editing && null}

      {/* 行内删除确认：覆盖垃圾桶 + 铅笔图标位置 */}
      {!editing && confirming && (
        <div
          className="flex shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[11px]" style={{ color: "var(--error)" }}>
            删除?
          </span>
          <button
            aria-label="确认删除"
            onClick={() => {
              cancelConfirm();
              onConfirmDelete(session.id);
            }}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--error)", color: "var(--text-inverse)" }}
          >
            确认
          </button>
          <button
            aria-label="取消删除"
            onClick={cancelConfirm}
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* 普通态：hover/active 时显示铅笔 + 垃圾桶 */}
      {!editing && !confirming && (
        <>
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
          <button
            aria-label="删除会话"
            onClick={(e) => {
              e.stopPropagation();
              startConfirming();
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
        </>
      )}
    </div>
  );
}