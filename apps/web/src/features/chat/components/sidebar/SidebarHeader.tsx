import { MessageCircle } from "lucide-react";
import { NewChatButton } from "./NewChatButton";

export function SidebarHeader() {
  return (
    <div
      className="flex shrink-0 flex-col gap-3 border-b p-3"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2">
        {/* <div
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: "var(--accent)" }}
        >
          <MessageCircle size={16} style={{ color: "var(--text-inverse)" }} />
        </div> */}
        <div>
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            AI Insight
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            多轮对话
          </div>
        </div>
      </div>
      <NewChatButton />
    </div>
  );
}
