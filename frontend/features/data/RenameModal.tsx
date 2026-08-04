"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(typeof record?.name === "string" ? record.name : "");
      return;
    }

    setName("");
    setIsSubmitting(false);
    setErrorMsg(null);
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
      setErrorMsg(t("data.renameDialog.error.renameFailed"));
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
          <DialogTitle>{t("data.renameDialog.title")}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("data.renameDialog.namePlaceholder")}
          className="mt-3 h-10 focus-visible:border-input focus-visible:ring-0"
          autoFocus
          disabled={isSubmitting}
        />
        {errorMsg && (
          <div className="text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2">
            {errorMsg}
          </div>
        )}
        <DialogFooter className="mt-auto flex-row justify-end">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleRename} disabled={!name.trim() || isSubmitting}>
            {t("data.renameDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
