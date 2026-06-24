import { Menu } from "lucide-react";
import { useChatStore } from "../../store";

export function SidebarToggle() {
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  return (
    <button
      onClick={() => setSidebarOpen(true)}
      aria-label="打开侧边栏"
      className="flex h-8 w-8 items-center justify-center rounded-md transition-colors md:hidden"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Menu size={18} />
    </button>
  );
}
