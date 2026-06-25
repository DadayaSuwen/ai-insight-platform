import { useState, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import { useChatStore } from "../../store";
import { useChatActions } from "../../hooks/useChatActions";
import { SidebarHeader } from "./SidebarHeader";
import { SessionList } from "./SessionList";
import { DeleteSessionDialog } from "./DeleteSessionDialog";
import { ScrollArea } from "../../../../components/ui/scroll-area";

export function SessionSidebar() {
  const { selectSession, handleDelete, handleRename } = useChatActions();
  const setSidebarCollapsed = useChatStore((s) => s.setSidebarCollapsed);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const onSelect = useCallback(
    (id: string) => {
      selectSession(id, {});
    },
    [selectSession],
  );

  return (
    <aside
      className="flex h-full w-[280px] shrink-0 flex-col"
      style={{
        background: "var(--bg-primary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <SidebarHeader />
      <ScrollArea className="flex-1 py-2">
        <SessionList
          onSelect={onSelect}
          onRequestDelete={(id) => {
            const s = useChatStore.getState().sessions.find((x) => x.id === id);
            setPendingDelete({ id, title: s?.title ?? "" });
          }}
          onRename={handleRename}
        />
      </ScrollArea>
      {/* Collapse toggle — fixed to the bottom of the expanded sidebar */}
      <div
        className="flex shrink-0 items-center justify-end border-t px-2 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setSidebarCollapsed(true)}
          aria-label="折叠侧边栏"
          title="折叠"
          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <ChevronLeft size={15} />
        </button>
      </div>
      <DeleteSessionDialog
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? ""}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
        }}
      />
    </aside>
  );
}
