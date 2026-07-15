import { ChevronLeft } from "lucide-react";
import { useChatStore } from "../../store";
import { useChatActions } from "../../hooks/useChatActions";
import { SidebarHeader } from "./SidebarHeader";
import { SessionList } from "./SessionList";
import { ScrollArea } from "../../../../components/ui/scroll-area";

export function SessionSidebar() {
  const { selectSession, handleDelete, handleRename } = useChatActions();
  const setSidebarCollapsed = useChatStore((s) => s.setSidebarCollapsed);

  const onSelect = (id: string) => {
    selectSession(id, {});
  };

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col bg-surface border-r border-default">
      <SidebarHeader />
      <ScrollArea className="flex-1 py-2">
        <SessionList
          onSelect={onSelect}
          onConfirmDelete={handleDelete}
          onRename={handleRename}
        />
      </ScrollArea>
      {/* Collapse toggle — fixed to the bottom of the expanded sidebar */}
      <div className="flex shrink-0 items-center justify-end border-t px-2 py-2 border-default">
        <button
          onClick={() => setSidebarCollapsed(true)}
          aria-label="折叠侧边栏"
          title="折叠"
          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors text-muted hover:bg-hover-custom hover:text-default"
        >
          <ChevronLeft size={15} />
        </button>
      </div>
    </aside>
  );
}