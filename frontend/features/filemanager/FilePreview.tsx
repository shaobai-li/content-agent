"use client";

import { useEffect, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentId } from "@/entities/agent/model";
import type { FileNode } from "./types";
import { fetchFileContent } from "@/shared/api/files";
import { formatDate, formatFileSize, getExtension } from "./fileTreeUtils";
import { getFileIcon } from "./fileIcons";

interface FilePreviewProps {
  node: FileNode | null;
  agentId: AgentId;
}

type ContentStatus = "idle" | "loading" | "error";

export function FilePreview({ node, agentId }: FilePreviewProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<ContentStatus>("idle");

  // 真实文件（有 path、无内联 content）时按 path 读取内容
  useEffect(() => {
    setContent(null);
    setStatus("idle");
    if (!node || node.type !== "file" || node.content !== undefined) return;
    if (!node.path) return;
    let cancelled = false;
    setStatus("loading");
    fetchFileContent(agentId, node.path)
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
  }, [agentId, node]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 标题区：图标 + 名称/元信息（与左标题区同为 h-14） */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Icon className="size-6 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{node.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {isFolder
              ? `${t("filemanager.folder")} · ${node.children?.length ?? 0} ${t("filemanager.items")}`
              : `${getExtension(node.name).toUpperCase() || t("filemanager.file")} · ${formatFileSize(node.size ?? 0)} · ${formatDate(node.modifiedAt ?? "")}`}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("filemanager.edit")}
          title={t("filemanager.edit")}
          className="shrink-0 p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
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
      </div>
      {/* 分割线 */}
      <div className="h-px shrink-0 bg-border" />
      {/* 内容区：文件夹子项列表 / 文件纯文本（内联 mock 或按 path 读取） */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isFolder ? (
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
