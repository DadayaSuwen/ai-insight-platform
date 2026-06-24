import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useChatActions } from "../../hooks/useChatActions";

export function NewChatButton() {
  const [loading, setLoading] = useState(false);
  const { handleNewChat } = useChatActions();

  return (
    <button
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          await handleNewChat();
        } finally {
          setLoading(false);
        }
      }}
      className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-opacity"
      style={{
        background: "var(--accent)",
        color: "var(--text-inverse)",
        opacity: loading ? 0.7 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
      新建对话
    </button>
  );
}
