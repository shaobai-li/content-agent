"use client";

import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

const DATABASE_QUERY_KEY = "db";

export function useKnowledgeBaseSelection() {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const databaseId = searchParams.get(DATABASE_QUERY_KEY);

  const updateDatabaseId = useCallback((nextDatabaseId: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextDatabaseId) {
      nextParams.set(DATABASE_QUERY_KEY, nextDatabaseId);
    } else {
      nextParams.delete(DATABASE_QUERY_KEY);
    }

    const query = nextParams.toString();
    navigate(query ? `${pathname}?${query}` : pathname, { replace: true });
  }, [pathname, navigate, searchParams]);

  const selectDatabase = useCallback((nextDatabaseId: string) => {
    updateDatabaseId(nextDatabaseId);
  }, [updateDatabaseId]);

  const clearDatabase = useCallback(() => {
    updateDatabaseId(null);
  }, [updateDatabaseId]);

  return {
    databaseId,
    selectDatabase,
    clearDatabase,
  };
}
