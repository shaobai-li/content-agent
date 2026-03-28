import { ChevronsLeft, ChevronsRight, MessageSquarePlus } from "lucide-react";
import { useDocumentCollapse } from "@/app-shell/DocumentCollapseContext";

export function ChatHeader() {
  const { isCollapsed, toggle } = useDocumentCollapse();

  const handleNewChat = () => {
    window.dispatchEvent(new CustomEvent("session-new"));
  };

  return (
    <div className="flex items-center h-16 px-4 border">
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-semibold text-foreground">CHAT</h2>
        <button
          onClick={toggle}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title={isCollapsed ? "展开文档区" : "收起文档区"}
        >
          {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>
      <button
        onClick={handleNewChat}
        className="ml-auto p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="新建对话"
      >
        <MessageSquarePlus size={18} />
      </button>
    </div>
  );
}
