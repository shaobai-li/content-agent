"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileChip } from "./FileChip";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

// Mock 数据 - 仅用于样式预览
const mockFiles = [
  { fileName: "项目需求文档.docx", fileType: "docx" as const },
  { fileName: "年度报告.pdf", fileType: "pdf" as const },
  { fileName: "产品介绍演示文稿.pptx", fileType: "pptx" as const },
  { fileName: "README.md", fileType: "md" as const },
];

export function ChatInput({ value, onChange, onSend }: ChatInputProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开整个容器时才取消拖拽状态
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    // 这里仅做样式演示，不处理实际上传逻辑
    console.log("Files dropped:", e.dataTransfer.files);
  };

  return (
    <div
      className={`relative rounded-lg border shadow-sm overflow-hidden transition-all duration-200 ${
        isDragging ? "border-2 border-dashed border-primary" : ""
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 拖拽遮罩层 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-primary/5 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span className="text-sm font-medium text-primary">释放以上传文件</span>
        </div>
      )}

      {/* 文件预览区 - 静态 mock 数据 */}
      <div className="flex flex-wrap gap-2 p-2 border-b bg-slate-50/50">
        {mockFiles.map((file, index) => (
          <FileChip
            key={index}
            fileName={file.fileName}
            fileType={file.fileType}
            onRemove={() => console.log("remove", file.fileName)}
          />
        ))}
      </div>

      {/* 输入区 */}
      <div className="flex items-center p-2">
        <Input
          className="flex-1 border-none focus-visible:ring-0 shadow-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Type messages ..."
        />
        <Button size="sm" className="text-xs gap-2.5" onClick={onSend}>
          Send
        </Button>
      </div>
    </div>
  );
}
    

