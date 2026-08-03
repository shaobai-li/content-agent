"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/ui/dialog";
import { createAgent } from "@/shared/api/management";
import { useTranslation } from "react-i18next";

interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewAgentDialog({
  open,
  onOpenChange,
  onCreated,
}: NewAgentDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);

    try {
      const res = await createAgent(trimmed, description.trim());
      if (!res.ok) {
        setError(res.error ?? t("agentManagement.createFailed"));
        return;
      }
      setTitle("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agentManagement.createFailedRetry"));
    } finally {
      setCreating(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle("");
      setDescription("");
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("agentManagement.newAgent")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <label
            htmlFor="new-agent-title"
            className="text-sm font-medium text-foreground"
          >
            {t("agentManagement.title")}
          </label>
          <input
            id="new-agent-title"
            type="text"
            className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-input focus-visible:ring-0"
            placeholder={t("agentManagement.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating && title.trim()) {
                handleSubmit();
              }
            }}
            disabled={creating}
            autoFocus
            autoComplete="off"
            maxLength={20}
          />
          <label
            htmlFor="new-agent-description"
            className="text-sm font-medium text-foreground"
          >
            {t("agentManagement.description")}
          </label>
          <textarea
            id="new-agent-description"
            rows={3}
            className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-input focus-visible:ring-0 resize-none"
            placeholder={t("agentManagement.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={creating}
            maxLength={200}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={creating}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={creating || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {creating && <Loader2 className="size-3.5 animate-spin" />}
            {creating ? t("agentManagement.creating") : t("agentManagement.create")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
