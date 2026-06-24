import { useState, useRef, useEffect, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
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
 * ChatInput — Claude-style composer.
 *
 * Layout (matches Claude.ai):
 *   ┌──────────────────────────────────────┐  ← single rounded container
 *   │  textarea (auto-grow, no border)     │     border + bg, no internal borders
 *   │                                      │
 *   │  ──────────────────────────────────  │
 *   │  [tools…]              [count]       │     bottom row: tools + char count
 *   └──────────────────────────────────────┘
 *                                              ↑ send button is a separate
 *                                                floating element, absolutely
 *                                                positioned bottom-right inside
 *                                                the container so it never
 *                                                competes with textarea height.
 */
function ChatInput({
  onSend,
  onStop,
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

  // Auto-resize textarea — capped at ~6 lines, then scrolls internally
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // ~24px line-height × 6 = 144px cap
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
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

  const handleButtonClick = () => {
    if (isLoading) {
      onStop?.();
    } else {
      submit();
    }
  };

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

      {/* Composer — single rounded container, absolutely-positioned send button */}
      <div className="px-4 pt-3 pb-3">
        <div
          className="relative flex flex-col rounded-3xl border transition-colors"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          {/* Textarea — fills the container, leaves room on the right for the send button */}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder ?? PLACEHOLDERS[placeholderIdx]}
            disabled={disabled || isLoading}
            rows={1}
            maxLength={maxLength}
            className="block w-full resize-none border-0 bg-transparent text-base transition-colors placeholder:text-[13px] placeholder:font-normal focus:outline-none focus:ring-0"
            style={{
              color: "var(--text-primary)",
              lineHeight: "18px",
              padding: "14px 56px 8px 18px",
              margin: 0,
              minHeight: "18px",
              maxHeight: "144px",
              overflowY: "auto",
              boxShadow: "none",
            }}
          />

          {/* Bottom toolbar row — tools on the left, char count on the right */}
          <div
            className="flex items-center justify-between gap-2 px-3 pb-2"
            style={{ color: "var(--text-muted)" }}
          >
            <div className="flex items-center gap-1 text-xs">
              {/* Reserved for future tools (model picker, attach, mic, etc.) */}
            </div>
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              {charCount > maxLength * 0.8 && (
                <span
                  style={{
                    color: isOverLimit
                      ? "var(--error)"
                      : charCount > maxLength * 0.9
                        ? "var(--warning)"
                        : "var(--text-muted)",
                  }}
                >
                  {charCount}/{maxLength}
                </span>
              )}
            </div>
          </div>

          {/* Send / Stop button — absolute, bottom-right, never collides with text */}
          <button
            onClick={handleButtonClick}
            disabled={!canSend && !isLoading}
            className="absolute bottom-2.5 right-3 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed"
            style={{
              background: isLoading
                ? "var(--error)"
                : canSend
                  ? "var(--accent)"
                  : "var(--bg-tertiary)",
              color: isLoading || canSend ? "white" : "var(--text-muted)",
            }}
            title={isLoading ? "停止生成" : "发送 (Enter)"}
          >
            {isLoading ? (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
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
      </div>

      {/* Keyboard hint */}
      <div
        className="flex items-center justify-end gap-4 px-4 pb-2 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <span>Enter 发送</span>
        <span>Shift + Enter 换行</span>
      </div>
    </div>
  );
}

export default ChatInput;
