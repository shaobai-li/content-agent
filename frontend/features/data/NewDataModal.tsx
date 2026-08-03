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

interface NewDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateData: (name: string, description: string) => Promise<void> | void;
}

export function NewDataModal({ open, onOpenChange, onCreateData }: NewDataModalProps) {
  const { t } = useTranslation();
  const [dataName, setDataName] = useState("");
  const [dataDescription, setDataDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDataName("");
      setDataDescription("");
      setErrorMsg(null);
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
      setErrorMsg(error instanceof Error ? error.message : t("kb.createFailedRetry"));
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
          <DialogTitle>{t("kb.newKnowledgeBase")}</DialogTitle>
        </DialogHeader>
        <Input
          value={dataName}
          onChange={(event) => setDataName(event.target.value)}
          placeholder={t("kb.namePlaceholder")}
          className="mt-3 h-10 focus-visible:border-input focus-visible:ring-0"
          autoFocus
        />
        <Input
          value={dataDescription}
          onChange={(event) => setDataDescription(event.target.value)}
          placeholder={t("kb.descriptionPlaceholder")}
          className="mt-3 h-10 focus-visible:border-input focus-visible:ring-0"
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
          <Button onClick={handleCreate} disabled={!dataName.trim() || isSubmitting}>
            {t("kb.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
