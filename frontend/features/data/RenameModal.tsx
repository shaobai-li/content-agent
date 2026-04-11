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

interface RenameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameModal({ open, onOpenChange }: RenameModalProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
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
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New name"
          className="mt-3 h-10"
          autoFocus
        />
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleClose}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
