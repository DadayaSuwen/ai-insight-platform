import { Menu } from "lucide-react";
import { useChatStore } from "../../store";

export function SidebarToggle() {
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  return (
    <button
      onClick={() => setSidebarOpen(true)}
      aria-label="打开侧边栏"
      className="flex h-8 w-8 items-center justify-center rounded-md transition-colors md:hidden text-secondary hover:bg-hover-custom"
    >
      <Menu size={18} />
    </button>
  );
}
