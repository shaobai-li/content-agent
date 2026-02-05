"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileChip } from "./FileChip";
import { FileTypeIconMap } from "@/components/ui/icons";

// 文件项类型
export type FileItem = {
  fileName: string;
  fileType: keyof typeof FileTypeIconMap;
};

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  // 文件管理（可选）
  files?: FileItem[];
  onFileRemove?: (index: number) => void;
}

// 内部 Hook：处理文件拖拽逻辑
function useDragAndDrop(onFilesDropped?: (files: FileList) => void) {
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
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesDropped?.(files);
    }
  };

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}

// 上传图标组件
function UploadIcon() {
  return (
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
  );
}

// 拖拽遮罩层组件
function DragOverlay() {
  return (
    <div className="absolute inset-0 z-10 bg-primary/5 flex flex-col items-center justify-center gap-2">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <UploadIcon />
      </div>
      <span className="text-sm font-medium text-muted-foreground">Release to upload</span>
    </div>
  );
}

export function ChatInput({ value, onChange, onSend, files, onFileRemove }: ChatInputProps) {
  const { isDragging, dragHandlers } = useDragAndDrop((droppedFiles) => {
    // 这里仅做样式演示，不处理实际上传逻辑
    console.log("Files dropped:", droppedFiles);
  });

  return (
    <div
      className={`relative truncate rounded-lg border shadow-sm overflow-hidden}`}
      {...dragHandlers}
    >
      {isDragging && <DragOverlay />}
     
      {files && files.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 border-b bg-slate-50/50">
          {files.map((file, index) => (
            <FileChip
              key={index}
              fileName={file.fileName}
              fileType={file.fileType}
              onRemove={() => onFileRemove?.(index)}
            />
          ))}
        </div>
      )}
     
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
    

