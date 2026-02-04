"use client";

import { useState, useEffect } from "react";
import { DataTable, DataTableColumn } from "./DataTable";

interface DataPanelProps<T> {
  columns: DataTableColumn<T>[];
  apiEndpoint: string;
  getRowKey: (item: T) => string;
  dataKey?: string; // API 返回数据中的 key，默认为 "records"
  emptyMessage?: string;
}

export function DataPanel<T>({
  columns,
  apiEndpoint,
  getRowKey,
  dataKey = "records",
  emptyMessage = "暂无数据"
}: DataPanelProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
