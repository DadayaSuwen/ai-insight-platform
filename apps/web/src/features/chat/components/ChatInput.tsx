import { useState, useRef, useEffect, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

const PLACEHOLDERS = [
  "输入消息，例如：按类目统计销售额",
  "输入消息，例如：展示月度销售趋势",
  "输入消息，例如：哪些商品库存偏低",
];

/**
 * ChatInput — textarea + submit.
 *
 * Enter to send, Shift+Enter for newline.
 * Shows placeholder cycling hint, character count, and send state.
 */
function ChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder,
  maxLength = 2000,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [placeholderIdx] = useState(() =>
    Math.floor(Math.random() * PLACEHOLDERS.length),
  );
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea (no hard cap — scrollbar appears when content overflows)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Focus on mount
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    // Reset height
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const charCount = value.length;
  const isOverLimit = charCount > maxLength;
  const canSend =
    value.trim().length > 0 && !isLoading && !disabled && !isOverLimit;

  return (
    <div
      className="flex flex-col border-t"
      style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
    >
      {/* Character limit warning */}
      {isOverLimit && (
        <div
          className="px-4 py-1 text-xs"
          style={{ background: "var(--error-light)", color: "var(--error)" }}
        >
          内容超出上限 ({charCount}/{maxLength})
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder ?? PLACEHOLDERS[placeholderIdx]}
            disabled={disabled || isLoading}
            rows={1}
            maxLength={maxLength}
            className="w-full resize-none rounded-xl border px-3 py-2 pr-16 text-sm leading-relaxed transition-colors placeholder:!text-xs"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
              outline: "none",
              minHeight: "40px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--accent)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--border)")
            }
          />

          {/* Character count badge */}
          <span
            className="absolute bottom-2 right-3 text-[10px] tabular-nums"
            style={{
              color: isOverLimit
                ? "var(--error)"
                : charCount > maxLength * 0.9
                  ? "var(--warning)"
                  : "var(--text-muted)",
            }}
          >
            {charCount > maxLength * 0.8 ? `${charCount}/${maxLength}` : ""}
          </span>
        </div>

        {/* Send button */}
        <button
          onClick={submit}
          disabled={!canSend}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed"
          style={{
            background: canSend ? "var(--accent)" : "var(--bg-tertiary)",
            color: canSend ? "white" : "var(--text-muted)",
          }}
          title="发送 (Enter)"
        >
          {isLoading ? (
            /* Spinner */
            <svg
              className="animate-spin"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            /* Send arrow */
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      {/* Keyboard hint */}
      <div
        className="flex items-center justify-end gap-4 px-3 pb-2 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <span>Enter 发送</span>
        <span>Shift + Enter 换行</span>
      </div>
    </div>
  );
}

export default ChatInput;
