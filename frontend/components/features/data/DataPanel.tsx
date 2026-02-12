"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable, DataTableColumn } from "./DataTable";

interface DataPanelProps<T> {
  columns: DataTableColumn<T>[];
  apiEndpoint: string;
  getRowKey: (item: T) => string;
  dataKey?: string; // API 返回数据中的 key，默认为 "records"
  emptyMessage?: string;
  refreshEvent?: string; // 自定义刷新事件名称
}

export function DataPanel<T>({
  columns,
  apiEndpoint,
  getRowKey,
  dataKey = "records",
  emptyMessage = "暂无数据",
  refreshEvent = "data-panel-refresh"
}: DataPanelProps<T>) {
  const [data, setData] = useState<T[]>([]);
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
      columns={columns}
      data={data}
      getRowKey={getRowKey}
      loading={loading}
      emptyMessage={emptyMessage}
    />
  );
}
