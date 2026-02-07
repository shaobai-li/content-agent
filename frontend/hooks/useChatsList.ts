"use client";

import { useCallback, useEffect, useState } from "react";
import { getChats } from "@/lib/chats-api";
import type { ChatListItem } from "@/types/chat";

/** 仅 agentId 为 "w" 时会请求聊天列表，其他返回空列表 */
export function useChatsList(agentId: string | null) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshChats = useCallback(async () => {
    if (agentId !== "w") {
      setChats([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await getChats();
      setChats(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    refreshChats();
  }, [refreshChats]);

  return { chats, loading, error, refreshChats };
}
