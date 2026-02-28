"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "./DataTable";
import { DataPanelConfig } from "@/entities/agent/model";

interface DataPanelProps extends DataPanelConfig {
  onView?: (item: any) => void;
  onRemove?: (item: any) => void;
}

export function DataPanel({
  apiEndpoint,
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

  // 封装数据获取函数
  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(apiEndpoint)
      .then((res) => res.json())
      .then((responseData) => {
        setData(responseData[dataKey] || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("获取数据失败:", err);
        setLoading(false);
      });
  }, [apiEndpoint, dataKey]);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 监听自定义刷新事件
  useEffect(() => {
    const handleRefresh = () => {
      console.log(`收到刷新事件: ${refreshEvent}`);
      fetchData();
    };

    window.addEventListener(refreshEvent, handleRefresh);
    
    return () => {
      window.removeEventListener(refreshEvent, handleRefresh);
    };
  }, [refreshEvent, fetchData]);

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
      onRemove={onRemove}
    />
  );
}
