"use client";

import { ReactNode } from "react";
import { useParams } from "next/navigation";
import { useSessionList } from "@/entities/session/useSessionList";
import { HistoryItem } from "./HistoryItem";
import { HistoryFooter } from "./HistoryFooter";

interface HistoryPanelProps {
  children?: ReactNode;
}

export function HistoryPanel() {
  const params = useParams();
  const agentId = (params?.agentId as string) ?? null;
  const { sessions, loading, error } = useSessionList(agentId);

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
