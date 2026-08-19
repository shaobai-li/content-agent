"use client";

import { useTranslation } from "react-i18next";
import type { FileNode } from "./types";
import { formatDate, formatFileSize, getExtension } from "./fileTreeUtils";
import { getFileIcon } from "./fileIcons";

interface FilePreviewProps {
  node: FileNode | null;
}

export function FilePreview({ node }: FilePreviewProps) {
  const { t } = useTranslation();

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t("filemanager.selectHint")}
      </div>
    );
  }

  const isFolder = node.type === "folder";
  const Icon = getFileIcon(node, false);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Icon className="size-8 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{node.name}</h3>
          <p className="text-xs text-muted-foreground">
            {isFolder
              ? `${t("filemanager.folder")} · ${node.children?.length ?? 0} ${t("filemanager.items")}`
              : `${getExtension(node.name).toUpperCase() || t("filemanager.file")} · ${formatFileSize(node.size ?? 0)} · ${formatDate(node.modifiedAt ?? "")}`}
          </p>
        </div>
      </div>

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
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-white">
          {node.content ? (
            <pre className="whitespace-pre-wrap p-4 font-mono text-xs text-foreground">
              {node.content}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t("filemanager.noPreview")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
