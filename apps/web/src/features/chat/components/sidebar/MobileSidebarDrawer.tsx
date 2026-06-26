import { Drawer, DrawerContent } from "../../../../components/ui/drawer";
import { useChatStore } from "../../store";
import { useChatActions } from "../../hooks/useChatActions";
import { SidebarHeader } from "./SidebarHeader";
import { SessionList } from "./SessionList";
import { ScrollArea } from "../../../../components/ui/scroll-area";

export function MobileSidebarDrawer() {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const { selectSession, handleDelete, handleRename, closeMobileSidebar } = useChatActions();

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
            onConfirmDelete={handleDelete}
            onRename={handleRename}
          />
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}