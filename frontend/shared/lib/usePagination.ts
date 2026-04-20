"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export function usePagination<T>(items: T[], pageSize: number) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => {
    if (items.length === 0) {
      return 0;
    }

    return Math.ceil(items.length / pageSize);
  }, [items.length, pageSize]);

  useEffect(() => {
    setCurrentPage((prevPage) => {
      if (totalPages === 0) {
        return 1;
      }

      return Math.min(prevPage, totalPages);
    });
  }, [totalPages]);

  const currentItems = useMemo(() => {
    if (items.length === 0) {
      return [];
    }

    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [currentPage, items, pageSize]);

  const canGoPrev = currentPage > 1;
  const canGoNext = totalPages > 0 && currentPage < totalPages;

  const goPrev = useCallback(() => {
    setCurrentPage((prevPage) => Math.max(prevPage - 1, 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((prevPage) => {
      if (totalPages === 0) {
        return 1;
      }

      return Math.min(prevPage + 1, totalPages);
    });
  }, [totalPages]);

  const resetPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    currentItems,
    currentPage,
    totalPages,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
    resetPage,
  };
}
