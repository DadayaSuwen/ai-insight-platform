import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "../../../lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** [Sprint 5.7+] 编辑时预填文本 */
  editText?: string;
}

const PLACEHOLDERS = [
  "基于已确认的 Schema，问任何问题…",
  "输入消息，例如：按类目统计销售额",
  "输入消息，例如：展示月度销售趋势",
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
  editText,
}: ChatInputProps) {
  const [value, setValue] = useState(editText ?? "");
  const [placeholderIdx] = useState(() =>
    Math.floor(Math.random() * PLACEHOLDERS.length),
  );
  const ref = useRef<HTMLTextAreaElement>(null);

  // [Sprint 5.7+] 编辑消息: 当 editText 变化时填入输入框
  useEffect(() => {
    if (editText) setValue(editText);
  }, [editText]);

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
    <div className="flex flex-col border-t bg-surface border-default">
      {/* Character limit warning */}
      {isOverLimit && (
        <div className="px-4 py-1 text-xs bg-error-light text-error">
          内容超出上限 ({charCount}/{maxLength})
        </div>
      )}

      {/* Composer — single rounded container, absolutely-positioned send button */}
      <div className="px-4 pt-3 pb-3">
        <div
          className="relative flex flex-col rounded-lg border bg-muted border-default transition-colors focus-within:border-[var(--accent)]"
          onFocus={undefined}
          onBlur={undefined}
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
            className="block w-full resize-none border-0 bg-transparent text-default text-base leading-[18px] pt-[14px] pr-[56px] pb-2 pl-[18px] m-0 min-h-[18px] max-h-[144px] overflow-y-auto shadow-none transition-colors placeholder:text-[13px] placeholder:font-normal focus:outline-none focus:ring-0"
          />

          {/* Bottom toolbar row — tools on the left, char count on the right */}
          <div className="flex items-center justify-between gap-2 px-3 pb-2 text-muted">
            <div className="flex items-center gap-1 text-xs">
              {/* Reserved for future tools (model picker, attach, mic, etc.) */}
            </div>
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              {charCount > maxLength * 0.8 && (
                <span
                  className={cn(
                    isOverLimit
                      ? "text-error"
                      : charCount > maxLength * 0.9
                        ? "text-warning"
                        : "text-muted",
                  )}
                >
                  {charCount}/{maxLength}
                </span>
              )}
            </div>
          </div>

          {/* Send / Stop button — 原型 .btn-primary 方形绿色按钮，bottom-right */}
          <button
            onClick={handleButtonClick}
            disabled={!canSend && !isLoading}
            className={cn(
              "absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-md shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed",
              isLoading
                ? "bg-red-500 text-white"
                : canSend
                  ? "bg-accent text-white"
                  : "bg-subtle text-muted",
            )}
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
      <div className="flex items-center justify-end gap-4 px-4 pb-2 text-[10px] text-muted">
        <span>Enter 发送</span>
        <span>Shift + Enter 换行</span>
      </div>
    </div>
  );
}

export default ChatInput;
