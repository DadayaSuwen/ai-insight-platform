import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useToastStore, type Toast } from "../store/toast";

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[toast.type];
  const accent =
    toast.type === "success"
      ? "var(--success)"
      : toast.type === "error"
        ? "var(--error)"
        : "var(--accent)";

  // 0 = 入场前, 1 = 完全显示, 2 = 退场中(由 store dismiss 触发)
  const [phase, setPhase] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setPhase(1));
    return () => cancelAnimationFrame(enter);
  }, []);

  const handleDismiss = () => {
    setPhase(2);
    // 等动画走完再真移除
    setTimeout(() => dismiss(toast.id), 180);
  };

  const animClass =
    phase === 2
      ? "opacity-0 translate-x-3"
      : phase === 1
        ? "opacity-100 translate-x-0"
        : "opacity-0 translate-x-3";

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-[320px] items-start gap-2 rounded-md px-3 py-2.5 shadow-md border bg-surface text-default border-default ${animClass} transition-all duration-200 ease-out`}
    >
      <Icon size={16} style={{ color: accent, marginTop: 2 }} />
      <div className="flex-1 text-sm">{toast.message}</div>
      <button
        onClick={handleDismiss}
        aria-label="关闭"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)] text-muted"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/** Fixed-position stack in the bottom-right. Mount once near the app root. */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
