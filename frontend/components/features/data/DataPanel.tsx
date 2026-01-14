"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Record {
  record_id: string;
  source_platform: string;
  author_name: string;
  videos: string[];
  images: string[];
}

export function DataPanel() {
  const [records, setRecords] = useState<Record[]>([]);
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
              <TableHead className="w-[80px]">平台</TableHead>
              <TableHead className="w-[100px]">作者</TableHead>
              <TableHead>图片</TableHead>
              <TableHead>视频</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((item) => (
              <TableRow key={item.record_id}>
                <TableCell>{item.source_platform}</TableCell>
                <TableCell className="font-medium">{item.author_name}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {item.images.length > 0 ? (
                    <ul className="list-none space-y-1">
                      {item.images.map((path, i) => (
                        <li key={i} className="truncate max-w-[200px]" title={path}>
                          {path}
                        </li>
                      ))}
                    </ul>
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
            ))}
          </TableBody>
        </Table>
      </div>
  );
}
