"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import type { AgentId } from "@/entities/agent/model";
import { createKnowledgeBase } from "@/shared/api/records";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { NewDataModal } from "../data/NewDataModal";
import { DataHeader } from "../data/DataHeader";
import { KNOWLEDGE_BASES_REFRESH_EVENT } from "./databaseRegistry";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";
import { useKnowledgeBases } from "./useKnowledgeBases";

const DATABASE_SEARCH_CHANGE_EVENT = "kb-database-search-change";

interface KnowledgeBaseHeaderProps {
  agentId: AgentId;
}

export function KnowledgeBaseHeader({ agentId }: KnowledgeBaseHeaderProps) {
  const { databases } = useKnowledgeBases(agentId);
  const { databaseId, selectDatabase, clearDatabase } = useKnowledgeBaseSelection();
  const selectedDatabase = useMemo(
    () => databases.find((database) => database.id === databaseId) ?? null,
    [databaseId, databases],
  );
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isNewDataModalOpen, setIsNewDataModalOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(DATABASE_SEARCH_CHANGE_EVENT, {
          detail: { keyword: searchKeyword },
        }),
      );
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchKeyword]);

  const handleCreateData = async (name: string, description: string) => {
    const response = await createKnowledgeBase(agentId, name, description);
    if (!response.success || !response.database) {
      throw new Error(response.message || "创建知识库失败");
    }

    window.dispatchEvent(new Event(KNOWLEDGE_BASES_REFRESH_EVENT));
    selectDatabase(response.database.id);
  };

  if (!selectedDatabase) {
    return (
      <>
        <div className="flex w-full flex-row items-center">
          <h2 className="text-sm font-semibold text-foreground">KNOWLEDG BASE</h2>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center rounded-md bg-muted px-4 py-0 text-xs focus-visible:ring-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="h-8 w-full border-none text-xs placeholder:text-muted-foreground shadow-none focus-visible:ring-0"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Create new item"
                  className="border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-4" strokeWidth={3} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem
                  className="gap-2.5"
                  onSelect={() => setIsNewDataModalOpen(true)}
                >
                  <BookOpen className="size-4" strokeWidth={3} />
                  <span>New DATA</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <NewDataModal
          open={isNewDataModalOpen}
          onOpenChange={setIsNewDataModalOpen}
          onCreateData={handleCreateData}
        />
      </>
    );
  }

  return (
    <DataHeader
      agentId={agentId}
      title={selectedDatabase.name}
      databaseId={selectedDatabase.id}
      onBack={clearDatabase}
      onCreateData={handleCreateData}
    />
  );
}
