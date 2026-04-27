"use client";

import { useRef, useState } from "react";
import { $getRoot, type EditorState } from "lexical";
import { LexicalEditor, type LexicalEditorHandle } from "./LexicalEditor";
import { Button } from "@/shared/ui/button";
import { FileChip } from "./FileChip";
import type { MentionItem } from "./MentionChip";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { Upload } from "lucide-react";
import { AgentId } from "@/entities/agent/model";
import {
  hasKnowledgeBaseDragData,
  readKnowledgeBaseDragData,
} from "@/shared/lib/dragData";

// 文件项类型
export type FileItem = {
  file: File;
  fileName: string;
  fileType: keyof typeof FileTypeIconMap;
  id: string;
  /** 后端持久化后的绝对路径（写入 local_data/cache 后返回） */
  cachedPath?: string;
  cacheStatus?: "uploading" | "ready" | "error";
  cacheError?: string;
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
  agentId: AgentId;
}

type DragOverlayKind = "files" | "knowledge-base";

function toMentionItem(data: ReturnType<typeof readKnowledgeBaseDragData>): MentionItem | null {
  if (!data) {
    return null;
  }

  return {
    kind: data.kind,
    id: data.id,
    name: data.name,
    kbId: data.kbId,
    ...(data.kind !== "database" ? { nodeId: data.nodeId } : {}),
    ...(data.kind === "record" ? { recordId: data.recordId } : {}),
    ...(data.kind === "record" && data.parsed_path ? { parsed_path: data.parsed_path } : {}),
  };
}

function getMentionKey(mention: MentionItem) {
  return `${mention.kind || "record"}:${mention.id}`;
}

// 内部 Hook：处理文件拖拽逻辑
function useDragAndDrop(
  onFilesDropped?: (files: FileList) => void,
  onMentionDropped?: (mention: MentionItem) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverlayKind, setDragOverlayKind] = useState<DragOverlayKind>("files");

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverlayKind(hasKnowledgeBaseDragData(e.dataTransfer) ? "knowledge-base" : "files");
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
    if (hasKnowledgeBaseDragData(e.dataTransfer)) {
      setDragOverlayKind("knowledge-base");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const mention = toMentionItem(readKnowledgeBaseDragData(e.dataTransfer));
    if (mention) {
      onMentionDropped?.(mention);
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesDropped?.(files);
    }
  };

  return {
    isDragging,
    dragOverlayKind,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}

// 拖拽遮罩层组件
function DragOverlay({
  hasFiles,
  kind,
}: {
  hasFiles: boolean;
  kind: DragOverlayKind;
}) {
  return (
    <div className={`absolute inset-0 z-10 bg-primary/5 flex ${hasFiles ? "flex-col" : "flex-row"} items-center justify-center gap-2`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Upload className="text-primary w-5 h-5" />
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        {kind === "knowledge-base" ? "Release to mention" : "Release to upload"}
      </span>
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
  agentId,
}: ChatInputProps) {
  const editorRef = useRef<LexicalEditorHandle>(null);
  const handleMentionDropped = (mention: MentionItem) => {
    if (
      mentions.some((item) => getMentionKey(item) === getMentionKey(mention)) ||
      editorRef.current?.hasMention(mention)
    ) {
      return;
    }

    editorRef.current?.insertMention(mention);
  };
  const { isDragging, dragOverlayKind, dragHandlers } = useDragAndDrop(
    onFilesDropped,
    handleMentionDropped,
  );

  const hasFiles: boolean = (files && files.length > 0) || false;
  const hasText: boolean = value.trim().length > 0;
  const hasMentions: boolean = mentions.length > 0;
  const hasContent: boolean = hasText || hasMentions;
  const filesBlockSend =
    files?.some(
      (f) =>
        f.cacheStatus === "uploading" ||
        (f.cacheStatus === "error" && !f.cachedPath),
    ) ?? false;
  const isSendDisabled: boolean =
    isSending || filesBlockSend || (!hasFiles && !hasContent);

  const extractMentionsFromState = (state: EditorState): MentionItem[] => {
    const json = state.toJSON() as {
      root?: { children?: unknown[] };
    };
    const result: MentionItem[] = [];
    const seen = new Set<string>();

    const walk = (nodes: unknown[]) => {
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const typedNode = node as {
          type?: string;
          value?: string;
          data?: {
            kind?: "database" | "folder" | "record";
            id?: string;
            kbId?: string;
            nodeId?: string;
            recordId?: string;
            parsed_path?: string;
          };
          children?: unknown[];
        };

        if (typedNode.type === "beautifulMention") {
          const id = typedNode.data?.id || typedNode.value || "";
          const name = typedNode.value || "";
          if (!id || !name) continue;

          const key = `${typedNode.data?.kind || "record"}::${id}::${name}`;
          if (seen.has(key)) continue;
          seen.add(key);

          result.push({
            id,
            name,
            kind: typedNode.data?.kind,
            kbId: typedNode.data?.kbId,
            nodeId: typedNode.data?.nodeId,
            recordId: typedNode.data?.recordId,
            parsed_path: typedNode.data?.parsed_path,
          });
        }

        if (Array.isArray(typedNode.children)) {
          walk(typedNode.children);
        }
      }
    };

    if (Array.isArray(json.root?.children)) {
      walk(json.root.children);
    }
    return result;
  };

  const handleEditorChange = (editorState: EditorState) => {
    const text = editorState.read(() => $getRoot().getTextContent());
    onChange(text);
    onMentionsChange?.(extractMentionsFromState(editorState));
  };

  return (
    <div
      className="relative rounded-lg border shadow-sm overflow-hidden"
      {...dragHandlers}
    >
      {isDragging && <DragOverlay hasFiles={hasFiles} kind={dragOverlayKind} />}
     

      {hasFiles && (
        <div className="flex flex-wrap gap-2 p-2 border-b bg-slate-50/50">
          {files?.map((file) => (
            <FileChip
              key={file.id}
              fileName={file.fileName}
              fileType={file.fileType}
              cacheStatus={file.cacheStatus}
              cacheError={file.cacheError}
              onRemove={() => onFileRemove?.(file.id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 p-2">
        <LexicalEditor
          ref={editorRef}
          className="flex-1 min-w-[120px]"
          placeholder="Type messages ..."
          value={value}
          onChange={handleEditorChange}
          onEnter={onSend}
          agentId={agentId}
        />
        <Button size="sm" className="text-xs gap-2.5" onClick={onSend} disabled={isSendDisabled}>
          Send
        </Button>
      </div>
    </div>
  );
}
    

