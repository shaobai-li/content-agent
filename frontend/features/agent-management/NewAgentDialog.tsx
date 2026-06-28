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
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);

    try {
      const res = await createAgent(trimmed);
      if (!res.ok) {
        setError(res.error ?? "创建失败");
        return;
      }
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请稍后重试");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建智能体</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <label
            htmlFor="new-agent-name"
            className="text-sm font-medium text-foreground"
          >
            智能体名称
          </label>
          <input
            id="new-agent-name"
            type="text"
            className="selection:bg-primary selection:text-primary-foreground border-input w-full rounded-md border bg-muted px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-input focus-visible:ring-0"
            placeholder="输入智能体名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating && name.trim()) {
                handleSubmit();
              }
            }}
            disabled={creating}
            autoFocus
            autoComplete="off"
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
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={creating || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {creating && <Loader2 className="size-3.5 animate-spin" />}
            {creating ? "创建中..." : "创建"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
