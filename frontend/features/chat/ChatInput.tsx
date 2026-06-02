"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { $getRoot, type EditorState } from "lexical";
import { LexicalEditor, type LexicalEditorHandle } from "./LexicalEditor";
import { Button } from "@/shared/ui/button";
import { FileChip } from "./FileChip";
import type { MentionItem } from "./MentionChip";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { AgentId } from "@/entities/agent/model";

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
  // 模型选择
  modelOption?: ModelOption;
  onModelChange?: (option: ModelOption) => void;
  /** 可用的模型选项列表（根据 API Key 配置动态过滤） */
  modelOptions?: ModelOption[];
}

export interface ChatInputHandle {
  insertMention: (mention: MentionItem) => void;
}

export type ModelOption = {
  provider: string;
  model: string;
  label: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  { provider: "deepseek", model: "deepseek-chat",   label: "DeepSeek Chat" },
  { provider: "openai",   model: "gpt-4o",          label: "GPT-4o" },
  { provider: "moonshot", model: "kimi-k2.5",       label: "Kimi K2.5" },
];

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
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
  modelOption = MODEL_OPTIONS[0],
  onModelChange,
  modelOptions = MODEL_OPTIONS,
}, ref) {
  const editorRef = useRef<LexicalEditorHandle>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const handleMentionDropped = useCallback((mention: MentionItem) => {
    if (
      mentions.some(
        (item) => `${item.kind || "record"}:${item.id}` === `${mention.kind || "record"}:${mention.id}`,
      ) ||
      editorRef.current?.hasMention(mention)
    ) {
      return;
    }

    editorRef.current?.insertMention(mention);
  }, [mentions]);

  useImperativeHandle(ref, () => ({
    insertMention: handleMentionDropped,
  }), [handleMentionDropped]);

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
  const noModelAvailable: boolean = modelOptions.length === 0;
  const isSendDisabled: boolean =
    isSending || filesBlockSend || (!hasFiles && !hasContent) || noModelAvailable;

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

  // 检测输入内容是否超过一行，切换单行/双层布局
  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;

    const update = () => {
      setExpanded(el.getBoundingClientRect().height > 60);
    };

    requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div className="relative rounded-lg border shadow-sm overflow-hidden">

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

      <div ref={editorContainerRef} className="flex flex-wrap items-center gap-1 p-2">
        <LexicalEditor
          ref={editorRef}
          className={
            "flex-1 min-w-[120px] max-h-[140px] overflow-y-auto" +
            (expanded ? " basis-full" : "")
          }
          placeholder="Type messages ..."
          value={value}
          onChange={handleEditorChange}
          onEnter={onSend}
          agentId={agentId}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1 px-2 font-normal text-muted-foreground hover:text-foreground ml-auto"
              disabled={noModelAvailable}
            >
              {noModelAvailable ? "未配置" : modelOption.label}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {modelOptions.map((opt) => (
              <DropdownMenuItem
                key={`${opt.provider}:${opt.model}`}
                onSelect={() => onModelChange?.(opt)}
                className={modelOption.provider === opt.provider && modelOption.model === opt.model ? "bg-accent" : ""}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" className="text-xs gap-2.5" onClick={onSend} disabled={isSendDisabled}>
          Send
        </Button>
      </div>
    </div>
  );
});


