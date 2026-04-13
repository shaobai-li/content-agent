"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Plus, FolderPlus, Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { createKbFolder } from "@/shared/api/records";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { NewFolderModal } from "./NewFolderModal";

export function DataHeader() {
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);

  const handleCreateFolder = async (folderName: string) => {
    const response = await createKbFolder(folderName);
    if (!response.success) {
      throw new Error(response.message || "创建文件夹失败");
    }

    window.dispatchEvent(new Event("kb-data-refresh"));
  };

  return (
    <>
      <div className="flex flex-row items-center w-full">
        <div className="flex items-center">
          <h2 className="text-sm font-semibold text-foreground">DATA</h2>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center bg-muted rounded-md focus-visible:ring-2 px-4 py-0 text-xs">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="h-8 text-xs w-full border-none focus-visible:ring-0 placeholder:text-muted-foreground shadow-none"
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
              <DropdownMenuItem
                className="gap-2.5"
                onSelect={() => setIsNewFolderModalOpen(true)}
              >
                <FolderPlus className="size-4" strokeWidth={3} />
                <span>New Folder</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2.5">
                <Plus className="size-4" strokeWidth={3} />
                <span>Add File</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <NewFolderModal
        open={isNewFolderModalOpen}
        onOpenChange={setIsNewFolderModalOpen}
        onCreateFolder={handleCreateFolder}
      />
    </>
  );
}
