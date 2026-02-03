"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlatformIconMap } from "@/components/ui/icons";
import { AGENT_NM_COLUMNS } from "@/app/agent_nm/columns";

interface DataRecord {
  record_id: string;
  source_platform: string;
  author_name: string;
  videos: string[];
  images: string[];
}

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

  if (loading) {
    return <div className="h-full flex items-center justify-center">加载中...</div>;
  }

  return (
      <div className="overflow-auto border rounded-lg bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {AGENT_NM_COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.width ? `w-[${col.width}]` : col.className}
                >
                  {col.label}
                </TableHead>
              ))} 
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((item) => {
              const platformIcon = PlatformIconMap[item.source_platform as keyof typeof PlatformIconMap];
              
              return (
                <TableRow key={item.record_id}>
                  <TableCell>
                    {platformIcon && (
                      <Image
                        src={platformIcon}
                        alt={item.source_platform}
                        title={item.source_platform}
                        width={24}
                        height={24}
                        className="w-6 h-6 object-contain"
                      />
                    )}
                  </TableCell>
                  <TableCell>{item.source_platform}</TableCell>
                <TableCell className="font-medium">{item.author_name}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {item.images.length > 0 ? (
                    <div className="truncate max-w-[200px]" title={item.images.join("\n")}>
                      {item.images[0]}
                    </div>
                  ) : (
                    <span className="text-gray-400">无</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
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
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
  );
}
