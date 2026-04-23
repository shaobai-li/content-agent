"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

interface NewFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateFolder: (folderName: string) => Promise<void>;
}

export function NewFolderModal({
  open,
  onOpenChange,
  onCreateFolder,
}: NewFolderModalProps) {
  const [folderName, setFolderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFolderName("");
    }
  }, [open]);

  const handleClose = () => {
    if (isSubmitting) return;
    onOpenChange(false);
  };

  const handleCreate = async () => {
    const trimmedFolderName = folderName.trim();
    if (!trimmedFolderName || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCreateFolder(trimmedFolderName);
      onOpenChange(false);
    } catch (error) {
      console.error("创建文件夹失败:", error);
      alert("创建文件夹失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm min-h-[180px] p-4 flex flex-col"
      >
        <DialogHeader className="text-left">
          <DialogTitle>New Folder</DialogTitle>
        </DialogHeader>
        <Input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="folder name"
          className="mt-3 h-10 focus-visible:border-input focus-visible:ring-0"
          autoFocus
          disabled={isSubmitting}
        />
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!folderName.trim() || isSubmitting}>
            Enter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
