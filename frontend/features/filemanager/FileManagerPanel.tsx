"use client";

import { useMemo, useState } from "react";
import type { AgentId } from "@/entities/agent/model";
import type { FileNode } from "./types";
import { MOCK_TREE } from "./mockData";
import { findNode } from "./fileTreeUtils";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";

interface FileManagerPanelProps {
  agentId: AgentId;
}

/** 初始展开所有文件夹，便于演示完整文件树 */
function getInitialExpanded(): Set<string> {
  const set = new Set<string>();
  const walk = (node: FileNode) => {
    if (node.type === "folder") set.add(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(MOCK_TREE);
  return set;
}

export function FileManagerPanel({ agentId }: FileManagerPanelProps) {
  void agentId; // 供 Plan 3 状态持久化使用
  const [expandedIds, setExpandedIds] = useState<Set<string>>(getInitialExpanded);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => (selectedId ? findNode(MOCK_TREE, selectedId) : null),
    [selectedId],
  );

  const handleToggleFolder = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 gap-0">
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-2">
        <FileTree
          nodes={[MOCK_TREE]}
          expandedIds={expandedIds}
          onToggleFolder={handleToggleFolder}
          selectedId={selectedId}
          onSelect={(node) => setSelectedId(node.id)}
        />
      </aside>
      <section className="min-w-0 flex-1 overflow-auto p-4">
        <FilePreview node={selectedNode} />
      </section>
    </div>
  );
}
