import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useChatActions } from "../../hooks/useChatActions";
import { cn } from "../../../../lib/utils";

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
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-opacity bg-accent text-inverse hover:bg-accent-hover",
        loading && "opacity-70",
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
      新建对话
    </button>
  );
}
