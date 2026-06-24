import { useState } from "react";
import { Drawer, DrawerContent } from "../../../../components/ui/drawer";
import { useChatStore } from "../../store";
import { useChatActions } from "../../hooks/useChatActions";
import { SidebarHeader } from "./SidebarHeader";
import { SessionList } from "./SessionList";
import { ScrollArea } from "../../../../components/ui/scroll-area";
import { DeleteSessionDialog } from "./DeleteSessionDialog";

export function MobileSidebarDrawer() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const { selectSession, handleDelete, closeMobileSidebar } = useChatActions();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  return (
    <Drawer open={sidebarOpen} onOpenChange={setSidebarOpen} direction="left">
      <DrawerContent>
        <SidebarHeader />
        <ScrollArea className="flex-1 py-2">
          <SessionList
            onSelect={(id) => {
              closeMobileSidebar();
              selectSession(id, {});
            }}
            onRequestDelete={(id) => {
              const s = useChatStore
                .getState()
                .sessions.find((x) => x.id === id);
              setPendingDelete({ id, title: s?.title ?? "" });
            }}
          />
        </ScrollArea>
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
      </DrawerContent>
    </Drawer>
  );
}
