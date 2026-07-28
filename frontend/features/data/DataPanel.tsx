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
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { DataTable } from "./DataTable";
import type { DataPanelConfig } from "./type";
import { useTranslation } from "react-i18next";

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
  columnMinWidths,
  tableMinWidth,
  columnOrder,
  getDragData,
  onView,
  onRemove,
}: DataPanelProps) {
  const { t } = useTranslation();
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
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const handleRemove = useCallback(
    (record: any) => {
      setDeleteConfirm(record);
    },
    []
  );

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteConfirm || !deleteDataFn) return;

    if (onRemove) {
      onRemove(deleteConfirm);
      setDeleteConfirm(null);
      return;
    }

    try {
      const targetId =
        deleteConfirm?.node_type === "folder"
          ? deleteConfirm.id
          : deleteConfirm.record_id ?? deleteConfirm.id;

      if (typeof targetId !== "string" || !targetId) {
        throw new Error(t("data.error.missingIdentifier"));
      }

      const response = await deleteDataFn(targetId);
      if (response?.success === false) {
        throw new Error(response.message || t("data.error.deleteFailed"));
      }
      loadData();
    } catch (error) {
      console.error(t("data.error.deleteFailed"), error);
      toast.error(t("data.error.deleteFailed"));
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteDataFn, onRemove, loadData, t]);

  const handleRename = useCallback(async (record: any, name: string) => {
    if (!renameDataFn) {
      console.warn(t("data.error.renameNotConfigured"));
      return;
    }

    const targetId =
      record?.node_type === "folder"
        ? record.id
        : record.record_id ?? record.id;

    if (typeof targetId !== "string" || !targetId) {
      throw new Error(t("data.error.missingRenameIdentifier"));
    }

    const response = await renameDataFn(targetId, name);
    if (response?.success === false) {
      throw new Error(response.message || t("data.error.renameFailed"));
    }

    loadData();
  }, [renameDataFn, loadData, t]);

  const handleMove = useCallback(async (record: any, parentId: string) => {
    if (!moveDataFn) {
      console.warn(t("data.error.moveNotConfigured"));
      return;
    }

    const targetId =
      record?.node_type === "folder"
        ? record.id
        : record.record_id ?? record.id;

    if (typeof targetId !== "string" || !targetId) {
      throw new Error(t("data.error.missingMoveIdentifier"));
    }

    const response = await moveDataFn(targetId, parentId);
    if (response?.success === false) {
      throw new Error(response.message || t("data.error.moveFailed"));
    }

    loadData();
  }, [moveDataFn, loadData, t]);

  const handleView = useCallback((record: any) => {
    if (record?.node_type === "folder" && typeof record.id === "string") {
      setCurrentFolderId(record.id);
      return;
    }

    onView?.(record);
  }, [onView]);

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

  const resolvedEmptyMessage = normalizedSearchKeyword
    ? t("data.noResults")
    : currentFolderId === ROOT_FOLDER_ID
      ? t(emptyMessage)
      : t("data.folderEmpty");

  return (
    <div className="-mt-2 flex h-full flex-col gap-2">
      <Breadcrumb className="px-6">
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            {currentFolderId === ROOT_FOLDER_ID ? (
              <BreadcrumbPage aria-label={t("data.rootLabel")}>
                <BookOpen className="size-4" />
              </BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild className="cursor-pointer" aria-label={t("data.rootLabel")}>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(ROOT_FOLDER_ID)}
                >
                  <BookOpen className="size-4" />
                </button>
              </BreadcrumbLink>
            )}
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
                      aria-label={t("data.breadcrumbEllipsis")}
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
        columnMinWidths={columnMinWidths}
        tableMinWidth={tableMinWidth}
        columnOrder={columnOrder}
        getDragData={getDragData}
        loading={loading}
        emptyMessage={resolvedEmptyMessage}
        onView={handleView}
        onMove={handleMove}
        onRename={handleRename}
        onRemove={handleRemove}
      />
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("data.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("data.confirmDelete.description", { name: deleteConfirm?.name || deleteConfirm?.record_id || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("data.confirmDelete.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirmed}>
              {t("data.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

