"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentId } from "@/entities/agent/model";
import { deleteKnowledgeBase } from "@/shared/api/records";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";
import { usePagination } from "@/shared/lib/usePagination";
import { HistoryFooter } from "../history/HistoryFooter";
import { HistoryItemMenu } from "../history/HistoryItemMenu";
import { RenameModal } from "../data/RenameModal";
import { KNOWLEDGE_BASES_REFRESH_EVENT } from "./databaseRegistry";
import { useKnowledgeBaseSelection } from "./useKnowledgeBaseSelection";
import { useKnowledgeBases } from "./useKnowledgeBases";
import { renameKnowledgeBase } from "@/shared/api/records";
import { writeKnowledgeBaseDragData } from "@/shared/lib/dragData";

const DATABASE_SEARCH_CHANGE_EVENT = "kb-database-search-change";
const PAGE_SIZE = 7;

interface KnowledgeBaseListPanelProps {
  agentId: AgentId;
}

export function KnowledgeBaseListPanel({ agentId }: KnowledgeBaseListPanelProps) {
  const { t } = useTranslation();
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
  const { currentItems, canGoPrev, canGoNext, goPrev, goNext, resetPage } = usePagination(
    visibleDatabases,
    PAGE_SIZE,
  );

  useEffect(() => {
    resetPage();
  }, [normalizedSearchKeyword, resetPage]);

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = (targetDatabaseId: string, databaseName: string) => {
    setDeleteConfirm({ id: targetDatabaseId, name: databaseName });
  };

  const handleRename = async (record: { id: string; name: string }, newName: string) => {
    const response = await renameKnowledgeBase(agentId, record.id, newName);
    if (!response.success) {
      throw new Error(response.message || t("data.renameDialog.error.renameFailed"));
    }
    window.dispatchEvent(new Event(KNOWLEDGE_BASES_REFRESH_EVENT));
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;

    try {
      const response = await deleteKnowledgeBase(agentId, deleteConfirm.id);
      if (!response.success) {
        throw new Error(response.message || t("kb.deleteFailed"));
      }

      if (databaseId === deleteConfirm.id) {
        clearDatabase();
      }

      window.dispatchEvent(new Event(KNOWLEDGE_BASES_REFRESH_EVENT));
    } catch (error) {
      console.error("删除知识库失败:", error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("kb.deleteFailedRetry"),
      );
    }
    setDeleteConfirm(null);
  };

  if (loading) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        {t("kb.loading")}
      </div>
    );
  }

  if (databases.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        {t("kb.noKnowledgeBase")}
      </div>
    );
  }

  if (visibleDatabases.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        {t("kb.noResults")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col overflow-auto">
        {currentItems.map((database) => {
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
              draggable
              onDragStart={(event) => {
                writeKnowledgeBaseDragData(event.dataTransfer, {
                  kind: "database",
                  id: database.id,
                  name: database.name,
                  kbId: database.id,
                });
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
                  <div onDragStart={(event) => event.stopPropagation()}>
                    <HistoryItemMenu
                      onDelete={() => handleDelete(database.id, database.name)}
                      onRename={() => setRenameTarget({ id: database.id, name: database.name })}
                    />
                  </div>
                </CardAction>
              </CardHeader>
            </Card>
          );
        })}
      </div>
      <RenameModal
        open={renameTarget !== null}
        onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
        record={renameTarget ? { id: renameTarget.id, name: renameTarget.name } : null}
        onRename={handleRename}
      />
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("data.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("data.confirmDelete.description", { name: deleteConfirm?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed}>
              {t("data.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col border-t p-4">
        <HistoryFooter
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
        />
      </div>
    </div>
  );
}
