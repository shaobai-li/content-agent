"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentId } from "@/entities/agent/model";
import { deleteKnowledgeBase } from "@/shared/api/records";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { HistoryFooter } from "../history/HistoryFooter";
import { HistoryItemMenu } from "../history/HistoryItemMenu";
import { KNOWLEDGE_BASES_REFRESH_EVENT } from "./databaseRegistry";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";
import { useKnowledgeBases } from "./useKnowledgeBases";

const DATABASE_SEARCH_CHANGE_EVENT = "kb-database-search-change";

interface KnowledgeBaseListPanelProps {
  agentId: AgentId;
}

export function KnowledgeBaseListPanel({ agentId }: KnowledgeBaseListPanelProps) {
  const { databases, loading } = useKnowledgeBases(agentId);
  const { databaseId, selectDatabase, clearDatabase } = useKnowledgeBaseSelection();
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    const handleSearchChange = (event: Event) => {
      const nextKeyword = (event as CustomEvent<{ keyword?: string }>).detail?.keyword;
      setSearchKeyword(typeof nextKeyword === "string" ? nextKeyword : "");
    };

    window.addEventListener(DATABASE_SEARCH_CHANGE_EVENT, handleSearchChange);

    return () => {
      window.removeEventListener(DATABASE_SEARCH_CHANGE_EVENT, handleSearchChange);
    };
  }, []);

  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();
  const visibleDatabases = useMemo(() => {
    if (!normalizedSearchKeyword) {
      return databases;
    }

    return databases.filter((database) => {
      const name = database.name.toLowerCase();
      const description = database.description.toLowerCase();
      return name.includes(normalizedSearchKeyword) || description.includes(normalizedSearchKeyword);
    });
  }, [databases, normalizedSearchKeyword]);

  const handleDelete = async (targetDatabaseId: string, databaseName: string) => {
    if (!confirm(`确定要删除 "${databaseName}" 吗？`)) {
      return;
    }

    try {
      const response = await deleteKnowledgeBase(agentId, targetDatabaseId);
      if (!response.success) {
        throw new Error(response.message || "删除知识库失败");
      }

      if (databaseId === targetDatabaseId) {
        clearDatabase();
      }

      window.dispatchEvent(new Event(KNOWLEDGE_BASES_REFRESH_EVENT));
    } catch (error) {
      console.error("删除知识库失败:", error);
      alert(error instanceof Error ? error.message : "删除知识库失败，请重试");
    }
  };

  if (loading) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        正在加载数据库...
      </div>
    );
  }

  if (databases.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        暂无数据库
      </div>
    );
  }

  if (visibleDatabases.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        未找到匹配的数据库
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col overflow-auto">
        {visibleDatabases.map((database) => {
          const isActive = database.id === databaseId;

          return (
            <Card
              key={database.id}
              role="button"
              tabIndex={0}
              onClick={() => selectDatabase(database.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectDatabase(database.id);
                }
              }}
              className={cn(
                "group cursor-pointer gap-0 rounded-none border-0 border-b border-neutral-200 px-3 py-4 shadow-none transition-colors",
                isActive ? "bg-muted" : "bg-neutral-50 hover:bg-muted",
              )}
            >
              <CardHeader className="px-0 py-0 gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                <CardTitle className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {database.name}
                </CardTitle>
                <CardDescription className="min-w-0 line-clamp-2 text-xs">
                  {database.description}
                </CardDescription>
                <CardAction>
                  <HistoryItemMenu onDelete={() => handleDelete(database.id, database.name)} />
                </CardAction>
              </CardHeader>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-col border-t p-4">
        <HistoryFooter />
      </div>
    </div>
  );
}
