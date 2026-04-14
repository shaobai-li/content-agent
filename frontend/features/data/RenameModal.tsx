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
  record: any | null;
  onRename?: (record: any, name: string) => Promise<void>;
}

export function RenameModal({ open, onOpenChange, record, onRename }: RenameModalProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(typeof record?.name === "string" ? record.name : "");
      return;
    }

    setName("");
    setIsSubmitting(false);
  }, [open, record]);

  const handleClose = () => {
    if (isSubmitting) return;
    onOpenChange(false);
  };

  const handleRename = async () => {
    const trimmedName = name.trim();

    if (!trimmedName || !record || isSubmitting) {
      return;
    }

    if (!onRename) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await onRename(record, trimmedName);
      onOpenChange(false);
    } catch (error) {
      console.error("重命名失败:", error);
      alert("重命名失败，请重试");
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
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New name"
          className="mt-3 h-10"
          autoFocus
          disabled={isSubmitting}
        />
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleRename} disabled={!name.trim() || isSubmitting}>
            {isSubmitting ? "重命名中..." : "确定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
