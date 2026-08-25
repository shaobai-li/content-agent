"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus, FolderPlus, Search } from "lucide-react";
import type { AgentId } from "@/entities/agent/model";
import type { FileNode } from "./types";
import { Input } from "@/shared/ui/input";
import { MOCK_TREE } from "./mockData";
import { filterTree, findNode } from "./fileTreeUtils";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";
import { fetchFileTree } from "@/shared/api/files";
import { useTranslation } from "react-i18next";

interface FileManagerPanelProps {
  agentId: AgentId;
}

/** 持久化状态结构版本号：mock 数据结构或状态字段变化时递增，旧版本数据自动失效 */
const FILE_MANAGER_STATE_VERSION = 2;

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

/** 展开指定树的所有文件夹 */
function getInitialExpanded(root: FileNode): Set<string> {
  const set = new Set<string>();
  const walk = (node: FileNode) => {
    if (node.type === "folder") set.add(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return set;
}

export function FileManagerPanel({ agentId }: FileManagerPanelProps) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState("");

  // 一次性读取持久化状态，避免同一 localStorage key 读两次
  const [initialState] = useState(() => {
    const saved = loadState(agentId);
    return {
      expandedIds: saved ? new Set(saved.expandedIds) : getInitialExpanded(MOCK_TREE),
      selectedId: saved?.selectedId ?? null,
      hadSaved: saved !== null,
    };
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialState.expandedIds);
  const [selectedId, setSelectedId] = useState<string | null>(initialState.selectedId);

  // 后端 workspace 树（加载失败回退 mock）
  const [tree, setTree] = useState<FileNode | null>(null);
  const root = tree ?? MOCK_TREE;

  useEffect(() => {
    let cancelled = false;
    fetchFileTree(agentId)
      .then((t) => {
        if (cancelled) return;
        setTree(t);
        // 首次加载（无持久化状态）：默认展开真实树全部文件夹
        if (!initialState.hadSaved) setExpandedIds(getInitialExpanded(t));
      })
      .catch(() => {
        if (!cancelled) setTree(MOCK_TREE);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const selectedNode = useMemo(
    () => (selectedId ? findNode(root, selectedId) : null),
    [selectedId, root],
  );

  const trimmed = keyword.trim();
  const filteredNodes = useMemo(() => filterTree(root, trimmed), [trimmed, root]);
  // 搜索时强制展开全部文件夹，保证命中节点可见
  const allExpanded = useMemo(() => getInitialExpanded(root), [root]);
  const effectiveExpanded = trimmed ? allExpanded : expandedIds;

  const handleToggleFolder = (id: string) => {
    // 搜索模式下保持全展开，忽略折叠点击，避免死点击误改持久化状态
    if (trimmed) return;
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

  // 文本保存后重拉树，刷新文件 modifiedAt
  const handleContentSaved = useCallback(() => {
    fetchFileTree(agentId).then(setTree).catch(() => {});
  }, [agentId]);

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* 左：目录树矩形 */}
      <div className="flex w-64 shrink-0 flex-col rounded-lg border bg-white shadow-sm">
        <div className="flex h-9 shrink-0 items-center gap-1 px-3">
          <div className="flex min-w-0 flex-1 items-center rounded-md bg-muted px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label={t("filemanager.search")}
              placeholder={t("filemanager.search")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8 w-full border-none bg-transparent text-xs placeholder:text-muted-foreground shadow-none focus-visible:ring-0"
            />
          </div>
          <button
            type="button"
            aria-label={t("filemanager.newFolder")}
            title={t("filemanager.newFolder")}
            className="shrink-0 p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <FolderPlus size={18} />
          </button>
          <button
            type="button"
            aria-label={t("filemanager.newFile")}
            title={t("filemanager.newFile")}
            className="shrink-0 p-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <FilePlus size={18} />
          </button>
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
        <FilePreview node={selectedNode} agentId={agentId} onContentSaved={handleContentSaved} />
      </div>
    </div>
  );
}
