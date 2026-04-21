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

interface NewDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateData: (name: string, description: string) => Promise<void> | void;
}

export function NewDataModal({ open, onOpenChange, onCreateData }: NewDataModalProps) {
  const [dataName, setDataName] = useState("");
  const [dataDescription, setDataDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setDataName("");
      setDataDescription("");
    }
  }, [open]);

  const handleClose = () => {
    if (isSubmitting) return;
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!dataName.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onCreateData(dataName.trim(), dataDescription.trim());
      onOpenChange(false);
    } catch (error) {
      console.error("创建知识库失败:", error);
      alert(error instanceof Error ? error.message : "创建知识库失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm min-h-[220px] p-4 flex flex-col"
      >
        <DialogHeader className="text-left">
          <DialogTitle>New Knowledg Base</DialogTitle>
        </DialogHeader>
        <Input
          value={dataName}
          onChange={(event) => setDataName(event.target.value)}
          placeholder="DATA name"
          className="mt-3 h-10 focus-visible:border-input focus-visible:ring-0"
          autoFocus
        />
        <Input
          value={dataDescription}
          onChange={(event) => setDataDescription(event.target.value)}
          placeholder="Description"
          className="mt-3 h-10 focus-visible:border-input focus-visible:ring-0"
        />
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!dataName.trim() || isSubmitting}>
            {isSubmitting ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
