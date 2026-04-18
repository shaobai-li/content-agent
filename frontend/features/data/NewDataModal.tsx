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
}

export function NewDataModal({ open, onOpenChange }: NewDataModalProps) {
  const [dataName, setDataName] = useState("");
  const [dataDescription, setDataDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setDataName("");
      setDataDescription("");
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleCreate = () => {
    if (!dataName.trim()) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm min-h-[220px] p-4 flex flex-col"
      >
        <DialogHeader className="text-left">
          <DialogTitle>New DATA</DialogTitle>
        </DialogHeader>
        <Input
          value={dataName}
          onChange={(event) => setDataName(event.target.value)}
          placeholder="DATA name"
          className="mt-3 h-10"
          autoFocus
        />
        <Input
          value={dataDescription}
          onChange={(event) => setDataDescription(event.target.value)}
          placeholder="Description"
          className="mt-3 h-10"
        />
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!dataName.trim()}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
