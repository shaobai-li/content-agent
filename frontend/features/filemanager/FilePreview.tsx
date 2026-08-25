"use client";

import { useEffect, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AgentId } from "@/entities/agent/model";
import type { FileNode } from "./types";
import { cn } from "@/shared/lib/cn";
import { Textarea } from "@/shared/ui/textarea";
import { fetchFileContent, updateFileContent } from "@/shared/api/files";
import { formatDate, formatFileSize, getExtension, isTextFile } from "./fileTreeUtils";
import { getFileIcon } from "./fileIcons";

interface FilePreviewProps {
  node: FileNode | null;
  agentId: AgentId;
  onContentSaved?: () => void;
}

type ContentStatus = "idle" | "loading" | "error";

export function FilePreview({ node, agentId, onContentSaved }: FilePreviewProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<ContentStatus>("idle");
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const nodePath = node?.path;
  // 仅真实文件（有 path、无内联 content）需要按 path 读取
  const shouldFetch = !!node && node.type === "file" && node.content === undefined && !!nodePath;

  // 依赖 nodePath/shouldFetch 而非整个 node：保存后树重拉（同 path）不触发二次 fetch
  useEffect(() => {
    setContent(null);
    setStatus("idle");
    setIsEditing(false);
    if (!shouldFetch || !nodePath) return;
    let cancelled = false;
    setStatus("loading");
    fetchFileContent(agentId, nodePath)
      .then((c) => {
        if (!cancelled) {
          setContent(c);
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, nodePath, shouldFetch]);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t("filemanager.selectHint")}
      </div>
    );
  }

  const isFolder = node.type === "folder";
  const Icon = getFileIcon(node, false);
  const hasInlineContent = node.content !== undefined;
  // 仅真实文本文件（有 path 且扩展名在白名单）可编辑
  const canEdit = node.type === "file" && !!node.path && isTextFile(node.name);
  const currentText = content ?? node.content ?? "";

  const handleStartEdit = () => {
    if (!canEdit) return;
    setEditText(currentText);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!node?.path) return;
    setSaving(true);
    try {
      await updateFileContent(agentId, node.path, editText);
      setContent(editText);
      setIsEditing(false);
      onContentSaved?.();
    } catch {
      toast.error(t("common.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 标题区：图标 + 名称/元信息（含两行文字，故比左搜索条 h-9 略高） */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <Icon className="size-6 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{node.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {isFolder
              ? `${t("filemanager.folder")} · ${node.children?.length ?? 0} ${t("filemanager.items")}`
              : `${getExtension(node.name).toUpperCase() || t("filemanager.file")} · ${formatFileSize(node.size ?? 0)} · ${formatDate(node.modifiedAt ?? "")}`}
          </p>
        </div>
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded-md px-2 py-1.5 text-sm font-medium transition-colors text-foreground hover:bg-muted disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="shrink-0 rounded-md px-2 py-1.5 text-sm transition-colors text-muted-foreground hover:bg-muted"
            >
              {t("common.cancel")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={t("filemanager.edit")}
              title={t("filemanager.edit")}
              disabled={!canEdit}
              onClick={handleStartEdit}
              className={cn(
                "shrink-0 p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted",
                !canEdit && "opacity-40 cursor-not-allowed",
              )}
            >
              <Pencil size={18} />
            </button>
            <button
              type="button"
              aria-label={t("filemanager.download")}
              title={t("filemanager.download")}
              className="shrink-0 p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Download size={18} />
            </button>
          </>
        )}
      </div>
      {/* 分割线 */}
      <div className="h-px shrink-0 bg-border" />
      {/* 内容区：文件夹子项列表 / 文件纯文本（内联 mock 或按 path 读取） / 编辑态 textarea */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="h-full min-h-full w-full resize-none font-mono text-xs"
          />
        ) : isFolder ? (
          <ul className="flex flex-col gap-1">
            {(node.children ?? []).map((child) => {
              const ChildIcon = getFileIcon(child, false);
              return (
                <li
                  key={child.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <ChildIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{child.name}</span>
                </li>
              );
            })}
          </ul>
        ) : hasInlineContent ? (
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
            {node.content}
          </pre>
        ) : status === "loading" ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : status === "error" ? (
          <div className="flex h-full items-center justify-center text-xs text-destructive">
            {t("common.error.loadFailed")}
          </div>
        ) : content !== null ? (
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{content}</pre>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("filemanager.noPreview")}
          </div>
        )}
      </div>
    </div>
  );
}
