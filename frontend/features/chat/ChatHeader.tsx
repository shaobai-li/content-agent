import { useState, useEffect } from "react";
import { ChevronsLeft, ChevronsRight, MessageSquarePlus, Smartphone } from "lucide-react";
import { useDocumentCollapse } from "@/app-shell/DocumentCollapseContext";
import { WeChatBindDialog } from "./WeChatBindDialog";

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || "http://localhost:8001";

export function ChatHeader() {
  const { isCollapsed, toggle } = useDocumentCollapse();
  const [wechatDialogOpen, setWechatDialogOpen] = useState(false);
  const [wechatConnected, setWechatConnected] = useState(false);

  useEffect(() => {
    fetch(`${BRIDGE_URL}/api/wechat/bridge/status`)
      .then((r) => r.json())
      .then((d) => setWechatConnected(d.running))
      .catch(() => {});
  }, []);

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
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => setWechatDialogOpen(true)}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative"
          title={wechatConnected ? "微信已连接" : "绑定微信"}
        >
          <Smartphone size={18} className={wechatConnected ? "text-green-500" : ""} />
          {wechatConnected && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500" />
          )}
        </button>
        <button
          onClick={handleNewChat}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="新建对话"
        >
          <MessageSquarePlus size={18} />
        </button>
      </div>
      <WeChatBindDialog
        open={wechatDialogOpen}
        onOpenChange={setWechatDialogOpen}
        onBindSuccess={() => setWechatConnected(true)}
      />
    </div>
  );
}
