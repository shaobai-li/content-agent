"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessions } from "@/lib/sessions-api";
import type { SessionListItem } from "@/types/chat";

export function useSessionsList(agentId: string | null) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    if (!agentId) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await getSessions(agentId);
      setSessions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  return { sessions, loading, error, refreshSessions };
}
