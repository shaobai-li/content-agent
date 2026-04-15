"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { BookOpen } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { DataTable } from "./DataTable";
import type { DataPanelConfig } from "./type";

interface DataPanelProps extends DataPanelConfig {
  onView?: (item: any) => void;
  onRemove?: (item: any) => void;
}

const ROOT_FOLDER_ID = "fld_root";
const ROOT_FOLDER_NAME = "Root";
const CURRENT_FOLDER_CHANGE_EVENT = "kb-current-folder-change";
const SEARCH_CHANGE_EVENT = "kb-data-search-change";

export function DataPanel({
  fetchData: fetchDataFn,
  renameData: renameDataFn,
  moveData: moveDataFn,
  deleteData: deleteDataFn,
  rowKeyField,
  dataKey = "nodes",
  emptyMessage = "暂无数据",
  refreshEvent = "data-panel-refresh",
  columnLabels,
  customRenderers,
  columnWidths,
  columnOrder,
  onView,
  onRemove,
}: DataPanelProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState(ROOT_FOLDER_ID);
  const [searchKeyword, setSearchKeyword] = useState("");

  // 数据获取函数
  const loadData = useCallback(() => {
    setLoading(true);
    fetchDataFn()
      .then((responseData) => {
        setData(responseData[dataKey] || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("获取数据失败:", err);
        setLoading(false);
      });
  }, [fetchDataFn, dataKey]);

  const folderMap = useMemo(() => {
    const map = new Map<string, any>();

    map.set(ROOT_FOLDER_ID, {
      id: ROOT_FOLDER_ID,
      name: ROOT_FOLDER_NAME,
      node_type: "folder",
      parent_id: null,
      _depth: -1,
    });

    for (const item of data) {
      if (item?.node_type === "folder" && typeof item.id === "string") {
        map.set(item.id, item);
      }
    }

    return map;
  }, [data]);

  const breadcrumbFolders = useMemo(() => {
    const path: any[] = [];
    const visited = new Set<string>();
    let folderId: string | null = currentFolderId;

    while (folderId && !visited.has(folderId)) {
      visited.add(folderId);
      const folder = folderMap.get(folderId);
      if (!folder) break;

      path.unshift(folder);
      folderId = typeof folder.parent_id === "string" ? folder.parent_id : null;
    }

    if (path.length === 0 || path[0]?.id !== ROOT_FOLDER_ID) {
      path.unshift(folderMap.get(ROOT_FOLDER_ID));
    }

    return path.filter(Boolean);
  }, [currentFolderId, folderMap]);

  const displayBreadcrumbFolders = useMemo(
    () => breadcrumbFolders.filter((folder) => folder?.id !== ROOT_FOLDER_ID),
    [breadcrumbFolders],
  );
  const currentFolderDepth = Math.max(0, breadcrumbFolders.length - 1);
  const shouldCollapseBreadcrumbs = displayBreadcrumbFolders.length > 3;
  const hiddenBreadcrumbFolders = shouldCollapseBreadcrumbs ? displayBreadcrumbFolders.slice(1, -2) : [];
  const leadingBreadcrumbFolder = shouldCollapseBreadcrumbs ? displayBreadcrumbFolders[0] : null;
  const trailingBreadcrumbFolders = shouldCollapseBreadcrumbs ? displayBreadcrumbFolders.slice(-2) : displayBreadcrumbFolders;
  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();

  const visibleData = useMemo(() => {
    const isDescendantOfCurrentFolder = (item: any) => {
      let parentId = typeof item?.parent_id === "string" ? item.parent_id : null;

      if (currentFolderId === ROOT_FOLDER_ID) {
        return true;
      }

      while (parentId) {
        if (parentId === currentFolderId) {
          return true;
        }

        const parentFolder = folderMap.get(parentId);
        parentId = typeof parentFolder?.parent_id === "string" ? parentFolder.parent_id : null;
      }

      return false;
    };

    return data
      .filter((item) => {
        if (normalizedSearchKeyword) {
          const itemName = String(item?.name || "").toLowerCase();
          return isDescendantOfCurrentFolder(item) && itemName.includes(normalizedSearchKeyword);
        }

        const parentId = typeof item?.parent_id === "string" ? item.parent_id : null;
        if (currentFolderId === ROOT_FOLDER_ID) {
          return parentId === ROOT_FOLDER_ID || parentId === null;
        }

        return parentId === currentFolderId;
      })
      .map((item) => ({
        ...item,
        _depth: Math.max(0, (typeof item?._depth === "number" ? item._depth : 0) - currentFolderDepth),
      }));
  }, [currentFolderDepth, currentFolderId, data, folderMap, normalizedSearchKeyword]);

  const resolvedRenderers = useMemo(() => {
    if (!customRenderers?.name) {
      return customRenderers;
    }

    return {
      ...customRenderers,
      name: (row: any) => {
        const content = customRenderers.name!(row);
        const canNavigate = row?.node_type === "folder" && typeof row.id === "string";

        if (!canNavigate) {
          return content;
        }

        return (
          <button
            type="button"
            onClick={() => setCurrentFolderId(row.id)}
            className="w-full text-left"
          >
            {content}
          </button>
        );
      },
    };
  }, [customRenderers]);

  // 删除处理函数
  const handleRemove = useCallback(async (record: any) => {
    if (onRemove) {
      onRemove(record);
      return;
    }

    if (!deleteDataFn) {
      console.warn("未配置删除函数");
      return;
    }

    if (!confirm(`确定要删除 "${record.name || record.record_id}" 吗？`)) {
      return;
    }

    try {
      const targetId =
        record?.node_type === "folder"
          ? record.id
          : record.record_id ?? record.id;

      if (typeof targetId !== "string" || !targetId) {
        throw new Error("缺少可删除的节点标识");
      }

      await deleteDataFn(targetId);
      console.log("删除成功");
      loadData();
    } catch (error) {
      console.error("删除失败:", error);
      alert("删除失败，请重试");
    }
  }, [deleteDataFn, onRemove, loadData]);

  const handleRename = useCallback(async (record: any, name: string) => {
    if (!renameDataFn) {
      console.warn("未配置重命名函数");
      return;
    }

    const targetId =
      record?.node_type === "folder"
        ? record.id
        : record.record_id ?? record.id;

    if (typeof targetId !== "string" || !targetId) {
      throw new Error("缺少可重命名的节点标识");
    }

    const response = await renameDataFn(targetId, name);
    if (response?.success === false) {
      throw new Error(response.message || "重命名失败");
    }

    loadData();
  }, [renameDataFn, loadData]);

  const handleMove = useCallback(async (record: any, parentId: string) => {
    if (!moveDataFn) {
      console.warn("未配置移动函数");
      return;
    }

    const targetId =
      record?.node_type === "folder"
        ? record.id
        : record.record_id ?? record.id;

    if (typeof targetId !== "string" || !targetId) {
      throw new Error("缺少可移动的节点标识");
    }

    const response = await moveDataFn(targetId, parentId);
    if (response?.success === false) {
      throw new Error(response.message || "移动失败");
    }

    loadData();
  }, [moveDataFn, loadData]);

  // 初始加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (currentFolderId === ROOT_FOLDER_ID) {
      return;
    }

    if (!folderMap.has(currentFolderId)) {
      setCurrentFolderId(ROOT_FOLDER_ID);
    }
  }, [currentFolderId, folderMap]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(CURRENT_FOLDER_CHANGE_EVENT, {
        detail: { folderId: currentFolderId },
      }),
    );
  }, [currentFolderId]);

  useEffect(() => {
    const handleSearchChange = (event: Event) => {
      const nextKeyword = (event as CustomEvent<{ keyword?: string }>).detail?.keyword;
      setSearchKeyword(typeof nextKeyword === "string" ? nextKeyword : "");
    };

    window.addEventListener(SEARCH_CHANGE_EVENT, handleSearchChange);

    return () => {
      window.removeEventListener(SEARCH_CHANGE_EVENT, handleSearchChange);
    };
  }, []);

  // 监听自定义刷新事件
  useEffect(() => {
    const handleRefresh = () => {
      console.log(`收到刷新事件: ${refreshEvent}`);
      loadData();
    };

    window.addEventListener(refreshEvent, handleRefresh);
    
    return () => {
      window.removeEventListener(refreshEvent, handleRefresh);
    };
  }, [refreshEvent, loadData]);

  return (
    <div className="-mt-2 flex h-full flex-col gap-2">
      <Breadcrumb className="px-6">
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            <BreadcrumbPage aria-label="DATA">
              <BookOpen className="size-4" />
            </BreadcrumbPage>
          </BreadcrumbItem>
          {displayBreadcrumbFolders.length > 0 ? <BreadcrumbSeparator /> : null}
          {leadingBreadcrumbFolder ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild className="cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(String(leadingBreadcrumbFolder.id || ROOT_FOLDER_ID))}
                  >
                    {String(leadingBreadcrumbFolder.name || ROOT_FOLDER_NAME)}
                  </button>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          {shouldCollapseBreadcrumbs ? (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-sm transition-colors hover:text-foreground"
                      aria-label="展开隐藏的面包屑层级"
                    >
                      <BreadcrumbEllipsis className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {hiddenBreadcrumbFolders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id ?? folder.name}
                        onClick={() => setCurrentFolderId(String(folder.id || ROOT_FOLDER_ID))}
                      >
                        {String(folder.name || ROOT_FOLDER_NAME)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          {trailingBreadcrumbFolders.map((folder, index) => {
            const isCurrent = index === trailingBreadcrumbFolders.length - 1;

            return (
              <Fragment key={folder.id ?? `${folder.name}-${index}`}>
                <BreadcrumbItem>
                  {isCurrent ? (
                    <BreadcrumbPage>{String(folder.name || ROOT_FOLDER_NAME)}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="cursor-pointer">
                      <button
                        type="button"
                        onClick={() => setCurrentFolderId(String(folder.id || ROOT_FOLDER_ID))}
                      >
                        {String(folder.name || ROOT_FOLDER_NAME)}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < trailingBreadcrumbFolders.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <DataTable
        data={visibleData}
        allData={data}
        rowKeyField={rowKeyField}
        columnLabels={columnLabels}
        customRenderers={resolvedRenderers}
        columnWidths={columnWidths}
        columnOrder={columnOrder}
        loading={loading}
        emptyMessage={normalizedSearchKeyword ? "未找到匹配的文件或文件夹" : emptyMessage}
        onView={onView}
        onMove={handleMove}
        onRename={handleRename}
        onRemove={handleRemove}
      />
    </div>
  );
}
