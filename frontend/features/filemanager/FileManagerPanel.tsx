"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentId } from "@/entities/agent/model";
import type { FileNode } from "./types";
import { MOCK_TREE } from "./mockData";
import { findNode } from "./fileTreeUtils";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";

interface FileManagerPanelProps {
  agentId: AgentId;
}

interface FileManagerState {
  expandedIds: string[];
  selectedId: string | null;
}

function getStorageKey(agentId: string): string {
  return `filemanager-state-${agentId}`;
}

function loadState(agentId: string): FileManagerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey(agentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FileManagerState;
    if (!parsed || !Array.isArray(parsed.expandedIds)) return null;
    return { expandedIds: parsed.expandedIds, selectedId: parsed.selectedId ?? null };
  } catch {
    return null;
  }
}

function saveState(agentId: string, state: FileManagerState): void {
  try {
    localStorage.setItem(getStorageKey(agentId), JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
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
  // 一次性读取持久化状态，避免同一 localStorage key 读两次
  const [initialState] = useState(() => {
    const saved = loadState(agentId);
    return {
      expandedIds: saved ? new Set(saved.expandedIds) : getInitialExpanded(),
      selectedId: saved?.selectedId ?? null,
    };
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialState.expandedIds);
  const [selectedId, setSelectedId] = useState<string | null>(initialState.selectedId);
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

  // 持久化展开/选中状态（按 agent 隔离），切换 agent 后保留
  useEffect(() => {
    saveState(agentId, { expandedIds: [...expandedIds], selectedId });
  }, [agentId, expandedIds, selectedId]);

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
