import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
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
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-[320px] items-start gap-2 rounded-md px-3 py-2.5 shadow-md"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      }}
    >
      <Icon size={16} style={{ color: accent, marginTop: 2 }} />
      <div className="flex-1 text-sm">{toast.message}</div>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="关闭"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--bg-hover)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
