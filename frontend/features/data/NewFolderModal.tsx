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
  const { t } = useTranslation();
  const [folderName, setFolderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFolderName("");
      setErrorMsg(null);
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
      setErrorMsg(t("kb.createFolderFailedRetry"));
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
          <DialogTitle>{t("kb.newFolder")}</DialogTitle>
        </DialogHeader>
        <Input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder={t("kb.folderNamePlaceholder")}
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
          <Button onClick={handleCreate} disabled={!folderName.trim() || isSubmitting}>
            {t("kb.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
