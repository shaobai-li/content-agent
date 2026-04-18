"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentId } from "@/entities/agent/model";
import { fetchKnowledgeBases, type KnowledgeBaseDatabase } from "@/shared/api/records";
import { KNOWLEDGE_BASES_REFRESH_EVENT } from "./databaseRegistry";

export function useKnowledgeBases(agentId: AgentId) {
  const [databases, setDatabases] = useState<KnowledgeBaseDatabase[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDatabases = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchKnowledgeBases(agentId);
      setDatabases(response.databases ?? []);
    } catch (error) {
      console.error("获取知识库列表失败:", error);
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    const handleRefresh = () => {
      loadDatabases();
    };

    window.addEventListener(KNOWLEDGE_BASES_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(KNOWLEDGE_BASES_REFRESH_EVENT, handleRefresh);
    };
  }, [loadDatabases]);

  return {
    databases,
    loading,
    refresh: loadDatabases,
  };
}
