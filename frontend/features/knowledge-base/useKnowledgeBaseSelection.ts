"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AgentId } from "@/entities/agent/model";
import { getKnowledgeBaseDatabase } from "./databaseRegistry";

const DATABASE_QUERY_KEY = "db";

export function useKnowledgeBaseSelection(agentId: AgentId) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const databaseId = searchParams.get(DATABASE_QUERY_KEY);
  const selectedDatabase = useMemo(() => {
    if (!databaseId) {
      return null;
    }

    return getKnowledgeBaseDatabase(agentId, databaseId);
  }, [agentId, databaseId]);

  const updateDatabaseId = useCallback((nextDatabaseId: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextDatabaseId) {
      nextParams.set(DATABASE_QUERY_KEY, nextDatabaseId);
    } else {
      nextParams.delete(DATABASE_QUERY_KEY);
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const selectDatabase = useCallback((nextDatabaseId: string) => {
    updateDatabaseId(nextDatabaseId);
  }, [updateDatabaseId]);

  const clearDatabase = useCallback(() => {
    updateDatabaseId(null);
  }, [updateDatabaseId]);

  return {
    databaseId,
    selectedDatabase,
    selectDatabase,
    clearDatabase,
  };
}
