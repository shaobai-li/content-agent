"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/shared/ui/button";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { DataTable } from "./DataTable";
import type { DataPanelConfig } from "./type";

interface DataPanelProps extends DataPanelConfig {
  onView?: (item: any) => void;
  onRemove?: (item: any) => void;
}

export function DataPanel({
  fetchData: fetchDataFn,
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

    if (!record.record_id) {
      console.warn("当前节点不支持删除", record);
      alert("当前仅支持删除文件，不支持删除文件夹");
      return;
    }

    try {
      await deleteDataFn(record.record_id);
      console.log("删除成功");
      loadData();
    } catch (error) {
      console.error("删除失败:", error);
      alert("删除失败，请重试");
    }
  }, [deleteDataFn, onRemove, loadData]);

  // 初始加载
  useEffect(() => {
    loadData();
  }, [loadData]);

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
            <BreadcrumbPage>
              <BookOpen className="size-4" />
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost">
                  <BreadcrumbEllipsis />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem>Documentation</DropdownMenuItem>
                  <DropdownMenuItem>Themes</DropdownMenuItem>
                  <DropdownMenuItem>GitHub</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">DATA</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Knowledge Base</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Current Folder</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <DataTable
        data={data}
        rowKeyField={rowKeyField}
        columnLabels={columnLabels}
        customRenderers={customRenderers}
        columnWidths={columnWidths}
        columnOrder={columnOrder}
        loading={loading}
        emptyMessage={emptyMessage}
        onView={onView}
        onRemove={handleRemove}
      />
    </div>
  );
}
