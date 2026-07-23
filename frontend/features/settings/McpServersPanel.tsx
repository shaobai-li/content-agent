"use client";

import { useState, useMemo } from "react";
import { Plus, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { useMcpSettings, type McpServerConfig } from "./useMcpSettings";
import { useTranslation } from "react-i18next";

// ── Component ─────────────────────────────────────────────────────

interface McpServersPanelProps {
  agentId: string;
}

export function McpServersPanel({ agentId: _agentId }: McpServersPanelProps) {
  const { t } = useTranslation();
  const { servers, loading, error, load, save } = useMcpSettings();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNames = useMemo(
    () =>
      Object.keys(servers).filter(
        (name) =>
          !searchQuery.trim() ||
          name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [servers, searchQuery],
  );

  // ── Dialog handlers ─────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingName(null);
    setJsonInput("");
    setJsonError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (name: string, cfg: McpServerConfig) => {
    setEditingName(name);
    setJsonInput(JSON.stringify({ name, ...cfg }, null, 2));
    setJsonError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setJsonError(null);
      const parsed = JSON.parse(jsonInput);
      if (!parsed.name?.trim()) {
        setJsonError(t("mcp.error.nameRequired"));
        return;
      }

      const { name, ...cfg } = parsed;
      const updated = { ...servers, [name]: cfg };
      const ok = await save(updated);
      if (ok) {
        setDialogOpen(false);
      } else {
        setJsonError(t("mcp.error.saveFailed"));
      }
    } catch {
      setJsonError(t("mcp.error.invalidJson"));
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{t("mcp.title")}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          title={t("mcp.refresh")}
          onClick={load}
        >
          <RotateCw className="size-3.5" />
          {t("mcp.refresh")}
        </Button>
      </div>

      {/* 衬线 */}
      <div className="w-full border-t border-border" />

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Input
          placeholder={t("mcp.searchPlaceholder")}
          className="max-w-60 h-9 text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={openAddDialog}
            size="sm"
          >
            <Plus className="size-3.5" />
            {t("mcp.addServer")}
          </Button>
        </div>
      </div>

      {/* ── Server Card Grid ────────────────────────────────────── */}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("mcp.loading")}</p>
      ) : filteredNames.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {searchQuery.trim()
            ? t("mcp.noResults")
            : t("mcp.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredNames.map((name) => (
            <ServerCard
              key={name}
              name={name}
              config={servers[name]}
              onEdit={() => openEditDialog(name, servers[name])}
              onDelete={() => setDeleteConfirm(name)}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit Dialog ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setJsonError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingName ? t("mcp.editTitle") : t("mcp.addTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              {t("mcp.formatHint")}
            </p>
            <div className="flex flex-col gap-1.5">
              <textarea
                placeholder={`{\n  "name": "my-server",\n  "command": "python",\n  "args": ["-m", "mcp_server_time"]\n}`}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className={cn(
                  "selection:bg-primary selection:text-primary-foreground border-input w-full min-w-0 rounded-md border bg-muted px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 resize-y",
                  "focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0",
                )}
                rows={12}
                autoComplete="off"
              />
              {jsonError && (
                <p className="text-xs text-destructive">{jsonError}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────── */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mcp.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mcp.confirmDelete.description", { name: deleteConfirm ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("mcp.confirmDelete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) {
                  const { [deleteConfirm]: _, ...rest } = servers;
                  save(rest);
                }
                setDeleteConfirm(null);
              }}
            >
              {t("mcp.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function ServerCard({
  name,
  config,
  onEdit,
  onDelete,
}: {
  name: string;
  config: McpServerConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const transport: string =
    config.transport ||
    (config.command
      ? "stdio"
      : config.url
        ? config.url.endsWith("/sse") ? "sse" : "streamableHttp"
        : "-");

  return (
    <Card className="flex flex-col h-55 gap-0 border-border bg-card py-4 text-card-foreground shadow-sm">
      {/* Top: name + badges */}
      <CardContent className="flex shrink-0 items-start justify-between px-4 pb-0">
        <span className="text-base font-semibold text-foreground">{name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {/* Transport badge */}
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {transport}
          </span>
        </div>
      </CardContent>

      {/* Command / URL summary */}
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-4 pb-0">
        <span className="text-xs text-muted-foreground">
          {config.command
            ? `command: ${config.command} ${(config.args || []).join(" ")}`
            : config.url
              ? `url: ${config.url}`
              : t("mcp.unconfigured")}
        </span>
      </CardContent>

      {/* Bottom: actions */}
      <CardContent className="flex shrink-0 flex-col gap-0 px-4 pb-0">
        <div className="w-full border-t border-border" />
        <div className="flex items-center gap-4 pt-3">
          <Button variant="ghost" size="sm" onClick={onEdit}>{t("mcp.edit")}</Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive hover:text-white" onClick={onDelete}>
            {t("mcp.remove")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

