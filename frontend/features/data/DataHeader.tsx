"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { ArrowLeft, Plus, FolderPlus, Search, BookOpen } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { createKbFolder } from "@/shared/api/records";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { NewFolderModal } from "./NewFolderModal";
import { NewDataModal } from "./NewDataModal";
import { AgentId } from "@/entities/agent/model";

const ROOT_FOLDER_ID = "fld_root";
const CURRENT_FOLDER_CHANGE_EVENT = "kb-current-folder-change";
const SEARCH_CHANGE_EVENT = "kb-data-search-change";

interface DataHeaderProps {
  agentId: AgentId;
  title?: string;
  onBack?: () => void;
  databaseId?: string;
  onCreateData?: (name: string, description: string) => Promise<void> | void;
}

export function DataHeader({
  agentId,
  title = "DATA",
  onBack,
  databaseId,
  onCreateData,
}: DataHeaderProps) {
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [isNewDataModalOpen, setIsNewDataModalOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(ROOT_FOLDER_ID);
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    const handleCurrentFolderChange = (event: Event) => {
      const nextFolderId = (event as CustomEvent<{ folderId?: string }>).detail?.folderId;
      setCurrentFolderId(typeof nextFolderId === "string" && nextFolderId ? nextFolderId : ROOT_FOLDER_ID);
    };

    window.addEventListener(CURRENT_FOLDER_CHANGE_EVENT, handleCurrentFolderChange);

    return () => {
      window.removeEventListener(CURRENT_FOLDER_CHANGE_EVENT, handleCurrentFolderChange);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(SEARCH_CHANGE_EVENT, {
          detail: { keyword: searchKeyword },
        }),
      );
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchKeyword]);

  const handleCreateFolder = async (folderName: string) => {
    const response = await createKbFolder(agentId, folderName, currentFolderId, databaseId);
    if (!response.success) {
      throw new Error(response.message || "创建文件夹失败");
    }

    window.dispatchEvent(new Event("kb-data-refresh"));
  };

  return (
    <>
      <div className="flex flex-row items-center w-full">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-md focus-visible:ring-2 px-4 py-0 text-xs">
            <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="h-8 text-xs w-full border-none focus-visible:ring-0 placeholder:text-muted-foreground shadow-none"
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
                className="border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="size-4" strokeWidth={3} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              {onCreateData ? (
                <DropdownMenuItem
                  className="gap-2.5"
                  onSelect={() => setIsNewDataModalOpen(true)}
                >
                  <BookOpen className="size-4" strokeWidth={3} />
                  <span>New Knowledge Base</span>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="gap-2.5"
                onSelect={() => setIsNewFolderModalOpen(true)}
              >
                <FolderPlus className="size-4" strokeWidth={3} />
                <span>New Folder</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Back to database list"
              className="border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onBack}
            >
              <ArrowLeft className="size-4" strokeWidth={3} />
            </Button>
          ) : null}
        </div>
      </div>
      <NewFolderModal
        open={isNewFolderModalOpen}
        onOpenChange={setIsNewFolderModalOpen}
        onCreateFolder={handleCreateFolder}
      />
      {onCreateData ? (
        <NewDataModal
          open={isNewDataModalOpen}
          onOpenChange={setIsNewDataModalOpen}
          onCreateData={onCreateData}
        />
      ) : null}
    </>
  );
}
