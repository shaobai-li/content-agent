"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FileChip } from "./FileChip";
import { MentionChip, type MentionItem } from "./MentionChip";
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
  // 提及标签（方式 A：标签在左，输入在右）
  mentions?: MentionItem[];
  onMentionsChange?: (mentions: MentionItem[]) => void;
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
  mentions = [],
  onMentionsChange,
  files,
  onFilesDropped,
  onFileRemove,
  isSending,
}: ChatInputProps) {
  const { isDragging, dragHandlers } = useDragAndDrop(onFilesDropped);
  const [mentionOpen, setMentionOpen] = useState(false);

  const hasFiles: boolean = (files && files.length > 0) || false;
  const hasText: boolean = value.trim().length > 0;
  const hasMentions: boolean = mentions.length > 0;
  const hasContent: boolean = hasText || hasMentions;
  const isSendDisabled: boolean = isSending || (!hasFiles && !hasContent);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\S*)$/);

    if (match) {
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const handleMentionSelect = (item: MentionItem) => {
    onMentionsChange?.([...mentions, item]);
    const match = value.match(/@\S*$/);
    if (match) {
      onChange(value.slice(0, value.length - match[0].length));
    }
  };

  const handleMentionRemove = (id: string) => {
    onMentionsChange?.(mentions.filter((m) => m.id !== id));
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
        <div className="flex flex-wrap items-center gap-1 p-2">
          {mentions.map((m) => (
            <MentionChip
              key={m.id}
              id={m.id}
              label={m.label}
              onRemove={() => handleMentionRemove(m.id)}
            />
          ))}
          <Input
            className="flex-1 min-w-[120px] border-none focus-visible:ring-0 shadow-none"
            value={value}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (mentionOpen) return;
              if (e.key === "Enter") onSend();
            }}
            placeholder={hasMentions ? "" : "Type messages ..."}
          />
          <Button size="sm" className="text-xs gap-2.5" onClick={onSend} disabled={isSendDisabled}>
            Send
          </Button>
        </div>
      </ChatMentionPopover>
    </div>
  );
}
    

