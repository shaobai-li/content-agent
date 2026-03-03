"use client";

import { ReactNode, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSessionList } from "@/entities/session/useSessionList";
import { deleteSession } from "@/entities/session/api";
import { HistoryItem } from "./HistoryItem";
import { HistoryFooter } from "./HistoryFooter";

interface HistoryPanelProps {
  children?: ReactNode;
}

export function HistoryPanel() {
  const params = useParams();
  const agentId = (params?.agentId as string) ?? null;
  const { sessions, loading, error, refreshSessions } = useSessionList(agentId);

  // 监听对话保存事件，刷新历史列表
  useEffect(() => {
    const handler = () => refreshSessions();
    window.addEventListener("session-refresh", handler);
    return () => window.removeEventListener("session-refresh", handler);
  }, [refreshSessions]);

  const handleDelete = useCallback(
    async (sessionId: string, title: string) => {
      if (!agentId) return;
      if (!confirm(`确定要删除 "${title}" 吗？`)) return;
      try {
        await deleteSession(agentId, sessionId);
        await refreshSessions();
      } catch (e) {
        console.error("删除失败:", e);
        alert("删除失败，请重试");
      }
    },
    [agentId, refreshSessions]
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex flex-col flex-1">
        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            加载中...
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-destructive">{error}</div>
        ) : (
          sessions.map((item) => (
            <HistoryItem
              key={item.session_id}
              id={item.session_id}
              title={item.title}
              preview={item.content}
              onDelete={() => handleDelete(item.session_id, item.title)}
            />
          ))
        )}
      </div>
      <div className="flex flex-col p-4 border-t">
        <HistoryFooter />
      </div>
    </div>
  );
}
