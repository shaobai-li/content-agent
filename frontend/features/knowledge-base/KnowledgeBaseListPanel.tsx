"use client";

import { ChevronRight } from "lucide-react";
import type { AgentId } from "@/entities/agent/model";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { getKnowledgeBaseDatabases } from "./databaseRegistry";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";

interface KnowledgeBaseListPanelProps {
  agentId: AgentId;
}

export function KnowledgeBaseListPanel({ agentId }: KnowledgeBaseListPanelProps) {
  const databases = getKnowledgeBaseDatabases(agentId);
  const { databaseId, selectDatabase } = useKnowledgeBaseSelection(agentId);

  if (databases.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        暂无数据库
      </div>
    );
  }

  return (
    <div className="-mx-6 -my-6 flex h-full flex-col overflow-auto">
      {databases.map((database) => {
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
              "cursor-pointer gap-0 rounded-none border-0 border-b border-neutral-200 px-4 py-4 shadow-none transition-colors",
              isActive ? "bg-muted" : "bg-neutral-50 hover:bg-muted",
            )}
          >
            <CardHeader className="px-0 py-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-sm font-semibold text-foreground">
                    {database.name}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    {database.description}
                  </CardDescription>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
