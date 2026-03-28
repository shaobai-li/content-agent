import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useDocumentCollapse } from "@/app-shell/DocumentCollapseContext";

export function ChatHeader() {
  const { isCollapsed, toggle } = useDocumentCollapse();

  return (
    <div className="flex items-center h-16 px-4 border">
      <button
        onClick={toggle}
        className="mr-2 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title={isCollapsed ? "展开文档区" : "收起文档区"}
      >
        {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
      <h2 className="text-sm font-semibold text-foreground">CHAT</h2>
    </div>
  );
}
