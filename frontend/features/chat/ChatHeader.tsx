import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useDocumentCollapse } from "@/app-shell/DocumentCollapseContext";

export function ChatHeader() {
  const { isCollapsed, toggle } = useDocumentCollapse();

  return (
    <div className="flex items-center h-16 px-4 border">
      <h2 className="text-sm font-semibold text-foreground">CHAT</h2>
      <button
        onClick={toggle}
        className="mr-2 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title={isCollapsed ? "展开文档区" : "收起文档区"}
      >
        {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
      </button>
    </div>
  );
}
