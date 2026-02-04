"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { DataTable, DataTableColumn } from "./DataTable";
import { PlatformIconMap } from "@/components/ui/icons";
import { AGENT_NM_COLUMNS } from "@/app/agent_nm/columns";

interface DataRecord {
  record_id: string;
  source_platform: string;
  author_name: string;
  videos: string[];
  images: string[];
}

// 渲染函数映射
const renderMap: Record<string, (item: DataRecord) => React.ReactNode> = {
  platform: (item) => {
    const platformIcon = PlatformIconMap[item.source_platform as keyof typeof PlatformIconMap];
    return (
      <div className="flex items-center gap-2">
        {platformIcon && (
          <Image
            src={platformIcon}
            alt={item.source_platform}
            title={item.source_platform}
            width={16}
            height={16}
            className="w-4 h-4 object-contain"
          />
        )}
        <span>{item.source_platform}</span>
      </div>
    );
  },
  author: (item) => (
    <span className="font-medium">{item.author_name}</span>
  ),
  images: (item) => (
    <div className="text-sm text-gray-600">
      {item.images.length > 0 ? (
        <div className="truncate max-w-[200px]" title={item.images.join("\n")}>
          {item.images[0]}
        </div>
      ) : (
        <span className="text-gray-400">无</span>
      )}
    </div>
  ),
  videos: (item) => (
    <div className="text-sm text-gray-600">
      {item.videos.length > 0 ? (
        <ul className="list-none space-y-1">
          {item.videos.map((path, i) => (
            <li key={i} className="truncate max-w-[200px]" title={path}>
              {path}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-gray-400">无</span>
      )}
    </div>
  )
};

export function DataPanel() {
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/records")
      .then((res) => res.json())
      .then((data) => {
        setRecords(data.records || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("获取数据失败:", err);
        setLoading(false);
      });
  }, []);

  // 基于配置文件创建完整的列定义
  const columns: DataTableColumn<DataRecord>[] = AGENT_NM_COLUMNS.map(col => ({
    ...col,
    render: renderMap[col.key]
  }));

  return (
    <DataTable
      columns={columns}
      data={records}
      getRowKey={(item) => item.record_id}
      loading={loading}
      emptyMessage="暂无数据"
    />
  );
}
