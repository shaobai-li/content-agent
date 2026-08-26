"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
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

interface TreeRowProps {
  node: FileNode;
  expanded: boolean;
  selected: boolean;
  depth: number;
  onToggleFolder: (id: string) => void;
  onSelect: (node: FileNode) => void;
}

/** 单行：draggable（拖拽源）+ droppable（放置目标）。文件夹→移入自身；文件→移入父目录；根级文件→根。 */
function TreeRow({ node, expanded, selected, depth, onToggleFolder, onSelect }: TreeRowProps) {
  const isFolder = node.type === "folder";
  const dragId = node.path ?? node.id;
  const dropTargetDir = isFolder
    ? (node.path ?? "")
    : node.path
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : "";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${dragId}`,
    data: { targetDir: dropTargetDir },
  });
  const setRefs = (el: HTMLButtonElement | null) => {
    setNodeRef(el);
    setDropRef(el);
  };

  const Icon = getFileIcon(node, expanded);

  return (
    <button
      ref={setRefs}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => {
        if (isFolder) onToggleFolder(node.id);
        onSelect(node);
      }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm",
        "hover:bg-accent cursor-pointer",
        selected && "bg-accent text-accent-foreground",
        isDragging && "opacity-50",
        isOver && "bg-accent/60 ring-1 ring-accent",
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      title={node.name}
      aria-current={selected ? "true" : undefined}
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
  );
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
        const selected = selectedId === node.id;

        return (
          <li key={node.id}>
            <TreeRow
              node={node}
              expanded={expanded}
              selected={selected}
              depth={depth}
              onToggleFolder={onToggleFolder}
              onSelect={onSelect}
            />

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
