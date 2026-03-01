"use client";

import { useState, useEffect, useCallback } from "react";
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
  dataKey = "records",
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
  );
}
