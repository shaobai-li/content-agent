"use client";

import { useState, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { LexicalEditor, type LexicalEditorHandle } from "./LexicalEditor";
import { FileChip } from "./FileChip";
import type { MentionItem } from "./MentionChip";
import { ChatMentionPopover } from "./ChatMentionPopover";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { Upload } from "lucide-react";

// 文件项类型
export type FileItem = {
  file: File; // 保存浏览器原生 File 对象
  fileName: string;
  fileType: keyof typeof FileTypeIconMap; // 支持其他类型
  id: string; // 唯一标识，用于删除
};

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  // 文件管理（可选）
  files?: FileItem[];
  onFilesDropped?: (files: FileList) => void; // 拖拽文件回调
  onFileRemove?: (id: string) => void; // 改为通过 id 删除
  isSending?: boolean; // 发送状态
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

// 拖拽遮罩层组件
function DragOverlay({ hasFiles }: { hasFiles: boolean }) {
  return (
    <div className={`absolute inset-0 z-10 bg-primary/5 flex ${hasFiles ? "flex-col" : "flex-row"} items-center justify-center gap-2`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Upload className="text-primary w-5 h-5" />
      </div>
      <span className="text-sm font-medium text-muted-foreground">Release to upload</span>
    </div>
  );
}

export function ChatInput({
  value,
  onChange,
  onSend,
  files,
  onFilesDropped,
  onFileRemove,
  isSending,
}: ChatInputProps) {
  const { isDragging, dragHandlers } = useDragAndDrop(onFilesDropped);
  const [mentionOpen, setMentionOpen] = useState(false);
  const lexicalRef = useRef<LexicalEditorHandle | null>(null);

  const hasFiles: boolean = (files && files.length > 0) || false;
  const hasText: boolean = value.trim().length > 0;
  const hasContent: boolean = hasText;
  const isSendDisabled: boolean = isSending || (!hasFiles && !hasContent);


  const handleInputChange = (val: string) => {
    onChange(val);
  };

  const handleMentionSelect = (item: MentionItem) => {
    lexicalRef.current?.insertMention(item);
    setMentionOpen(false);
  };

  return (
    <div
      className="relative rounded-lg border shadow-sm overflow-hidden"
      {...dragHandlers}
    >
      {isDragging && <DragOverlay hasFiles={hasFiles} />}
     

      {hasFiles && (
        <div className="flex flex-wrap gap-2 p-2 border-b bg-slate-50/50">
          {files?.map((file) => (
            <FileChip
              key={file.id}
              fileName={file.fileName}
              fileType={file.fileType}
              onRemove={() => onFileRemove?.(file.id)}
            />
          ))}
        </div>
      )}

      <ChatMentionPopover
        open={mentionOpen}
        onOpenChange={setMentionOpen}
        onSelect={handleMentionSelect}
      >
        <div className="flex flex-nowrap items-stretch gap-2 p-2">
          <div className="flex flex-1 min-w-0">
            <LexicalEditor
              ref={lexicalRef}
              className="flex-1 min-w-[120px] border-none focus-visible:ring-0 shadow-none"
              value={value}
              onChange={handleInputChange}
              onMentionTriggerChange={setMentionOpen}
              placeholder="Type messages ..."
              onKeyDown={(e) => {
                if (mentionOpen) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
          </div>
          <Button size="sm" className="shrink-0 self-end text-xs gap-2.5" onClick={onSend} disabled={isSendDisabled}>
            Send
          </Button>
        </div>
      </ChatMentionPopover>
    </div>
  );
}
    

