"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus, FolderPlus, Search } from "lucide-react";
import type { AgentId } from "@/entities/agent/model";
import type { FileNode } from "./types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { MOCK_TREE } from "./mockData";
import { filterTree, findNode } from "./fileTreeUtils";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";
import { useTranslation } from "react-i18next";

interface FileManagerPanelProps {
  agentId: AgentId;
}

/** 持久化状态结构版本号：mock 数据结构或状态字段变化时递增，旧版本数据自动失效 */
const FILE_MANAGER_STATE_VERSION = 1;

interface FileManagerState {
  version: number;
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
    if (!parsed || parsed.version !== FILE_MANAGER_STATE_VERSION) return null;
    if (!Array.isArray(parsed.expandedIds)) return null;
    return {
      version: FILE_MANAGER_STATE_VERSION,
      expandedIds: parsed.expandedIds,
      selectedId: parsed.selectedId ?? null,
    };
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
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState("");

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

  const trimmed = keyword.trim();
  const filteredNodes = useMemo(() => filterTree(MOCK_TREE, trimmed), [trimmed]);
  // 搜索时强制展开全部文件夹，保证命中节点可见
  const allExpanded = useMemo(() => getInitialExpanded(), []);
  const effectiveExpanded = trimmed ? allExpanded : expandedIds;

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
    saveState(agentId, {
      version: FILE_MANAGER_STATE_VERSION,
      expandedIds: [...expandedIds],
      selectedId,
    });
  }, [agentId, expandedIds, selectedId]);

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* 左：目录树矩形 */}
      <div className="flex w-64 shrink-0 flex-col rounded-lg border bg-white shadow-sm">
        <div className="flex items-center gap-2 p-3">
          <div className="flex min-w-0 flex-1 items-center rounded-md bg-muted px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder={t("filemanager.search")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8 w-full border-none bg-transparent text-xs placeholder:text-muted-foreground shadow-none focus-visible:ring-0"
            />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("filemanager.newFolder")}
            title={t("filemanager.newFolder")}
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("filemanager.newFile")}
            title={t("filemanager.newFile")}
          >
            <FilePlus className="size-4" />
          </Button>
        </div>
        <div className="h-px shrink-0 bg-border" />
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
              {t("filemanager.searchEmpty")}
            </div>
          ) : (
            <FileTree
              nodes={filteredNodes}
              expandedIds={effectiveExpanded}
              onToggleFolder={handleToggleFolder}
              selectedId={selectedId}
              onSelect={(node) => setSelectedId(node.id)}
            />
          )}
        </div>
      </div>

      {/* 右：文件视图矩形 */}
      <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-white shadow-sm">
        <FilePreview node={selectedNode} />
      </div>
    </div>
  );
}
