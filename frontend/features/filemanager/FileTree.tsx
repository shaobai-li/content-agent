"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { FileNode } from "./types";
import { getFileIcon } from "./fileIcons";

interface FileTreeProps {
  nodes: FileNode[];
  expandedIds: Set<string>;
  onToggleFolder: (id: string) => void;
  selectedId: string | null;
  onSelect: (node: FileNode) => void;
  depth?: number;
}

export function FileTree({
  nodes,
  expandedIds,
  onToggleFolder,
  selectedId,
  onSelect,
  depth = 0,
}: FileTreeProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => {
        const isFolder = node.type === "folder";
        const expanded = isFolder && expandedIds.has(node.id);
        const Icon = getFileIcon(node, expanded);
        const selected = selectedId === node.id;

        return (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => {
                if (isFolder) onToggleFolder(node.id);
                onSelect(node);
              }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm",
                "hover:bg-accent cursor-pointer",
                selected && "bg-accent text-accent-foreground",
              )}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              title={node.name}
            >
              {isFolder ? (
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-90",
                  )}
                />
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
            </button>

            {isFolder && expanded && node.children && (
              <FileTree
                nodes={node.children}
                expandedIds={expandedIds}
                onToggleFolder={onToggleFolder}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
