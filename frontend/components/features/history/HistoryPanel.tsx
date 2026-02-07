"use client";

import { ReactNode } from "react";
import { useParams } from "next/navigation";
import { useChatsList } from "@/hooks/useChatsList";
import { HistoryItem } from "./HistoryItem";
import { HistoryFooter } from "./HistoryFooter";

interface HistoryPanelProps {
  children?: ReactNode;
}

export function HistoryPanel({ children }: HistoryPanelProps) {
  const params = useParams();
  const agentId = (params?.agentId as string) ?? null;
  const { chats, loading, error } = useChatsList(agentId);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex flex-col flex-1">
        {loading && (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            加载中...
          </div>
        )}
        {error && (
          <div className="px-3 py-4 text-sm text-destructive">{error}</div>
        )}
        {!loading && !error &&
          chats.map((item) => (
            <HistoryItem
              key={item.chat_id}
              id={item.chat_id}
              title={item.title}
              preview={item.content}
            />
          ))}
        {children}
      </div>
      <div className="flex flex-col p-4 border-t">
        <HistoryFooter />
      </div>
    </div>
  );
}
