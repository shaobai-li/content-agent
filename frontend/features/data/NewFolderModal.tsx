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
}

export function NewFolderModal({ open, onOpenChange }: NewFolderModalProps) {
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    if (!open) {
      setFolderName("");
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
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
          placeholder="Folder name"
          className="mt-3 h-10"
          autoFocus
        />
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleClose}>新建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
