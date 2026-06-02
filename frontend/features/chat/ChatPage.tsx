"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useChat } from "@/features/chat/useChat";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { DashboardHero } from "./DashboardHero";
import { ChatInput, type FileItem, type ModelOption, MODEL_OPTIONS } from "./ChatInput";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { API_BASE_URL } from "@/shared/api/config";
import { uploadAgentAttachmentCache } from "@/shared/api/attachments";
import { Upload } from "lucide-react";
import {
  hasKnowledgeBaseDragData,
  readKnowledgeBaseDragData,
} from "@/shared/lib/dragData";
import type { MentionItem } from "./MentionChip";
import { useDocumentCollapse } from "@/app-shell/DocumentCollapseContext";
import { http } from "@/shared/api/http";

interface ChatPageProps {
  agentId: string; // 简短的agent标识，用于构建API端点
}

type DragOverlayKind = "files" | "knowledge-base";

// 拖拽遮罩层组件
function DragOverlay({ kind }: { kind: DragOverlayKind }) {
  return (
    <div className="absolute inset-0 z-10 bg-primary/5 flex items-center justify-center gap-2 rounded-lg">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <Upload className="text-primary w-5 h-5" />
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        {kind === "knowledge-base" ? "释放以引用" : "释放以上传文件"}
      </span>
    </div>
  );
}

// 文件拖拽 Hook
function useFileDragAndDrop(
  onFilesDropped?: (files: FileList) => void,
  onMentionDropped?: (mention: MentionItem) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverlayKind, setDragOverlayKind] = useState<DragOverlayKind>("files");

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverlayKind(hasKnowledgeBaseDragData(e.dataTransfer) ? "knowledge-base" : "files");
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasKnowledgeBaseDragData(e.dataTransfer)) {
      setDragOverlayKind("knowledge-base");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // 优先处理知识库拖拽
    const mention = (() => {
      const data = readKnowledgeBaseDragData(e.dataTransfer);
      if (!data) return null;
      return {
        kind: data.kind,
        id: data.id,
        name: data.name,
        kbId: data.kbId,
        ...(data.kind !== "database" ? { nodeId: data.nodeId } : {}),
        ...(data.kind === "record" ? { recordId: data.recordId } : {}),
        ...(data.kind === "record" && data.parsed_path ? { parsed_path: data.parsed_path } : {}),
      } as MentionItem;
    })();

    if (mention) {
      onMentionDropped?.(mention);
      return;
    }

    // 处理文件拖拽
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesDropped?.(files);
    }
  }, [onFilesDropped, onMentionDropped]);

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

export function ChatPage({ agentId }: ChatPageProps) {
  // 根据 agentId 自动构建 API 端点
  const apiEndpoint = `${API_BASE_URL}/api/agents/${agentId}/chat`;

  const { isCollapsed } = useDocumentCollapse();
  
  const { input, setInput, messages, handleSend, isSending, loadSession, startNewSession } = useChat({ 
    agentId, 
    apiEndpoint 
  });

  // 监听历史面板派发的 session-select 事件，加载对应会话消息
  useEffect(() => {
    const handleSessionSelect = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail;
      loadSession(sessionId);
    };
    const handleSessionNew = () => {
      startNewSession();
    };
    window.addEventListener("session-select", handleSessionSelect);
    window.addEventListener("session-new", handleSessionNew);
    return () => {
      window.removeEventListener("session-select", handleSessionSelect);
      window.removeEventListener("session-new", handleSessionNew);
    };
  }, [loadSession, startNewSession]);

  // 管理待上传的文件列表
  const [pendingFiles, setPendingFiles] = useState<FileItem[]>([]);
  // 管理提及标签（如知识库）
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  // 已配置 API Key 的 provider 集合
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  // 当前选择的 LLM 供应商和模型
  const [modelOption, setModelOption] = useState<ModelOption>(MODEL_OPTIONS[0]);

  // 根据 API Key 配置过滤可用的模型选项
  const availableModelOptions = useMemo(() => {
    return MODEL_OPTIONS.filter((opt) => configuredProviders.has(opt.provider));
  }, [configuredProviders]);

  // 当可用选项变化时，若当前选择不再可用则切到第一个可用
  useEffect(() => {
    if (availableModelOptions.length === 0) return;
    const stillAvailable = availableModelOptions.some(
      (o) => o.provider === modelOption.provider && o.model === modelOption.model,
    );
    if (!stillAvailable) {
      setModelOption(availableModelOptions[0]);
    }
  }, [availableModelOptions, modelOption.provider, modelOption.model]);

  // 获取已配置 API Key 的 provider 列表
  useEffect(() => {
    http
      .get<{ providers: { provider: string; set: boolean }[] }>("/api/settings/env")
      .then((data) => {
        const configured = new Set(
          data.providers.filter((p) => p.set).map((p) => p.provider),
        );
        setConfiguredProviders(configured);
      })
      .catch(() => {
        // 请求失败，不显示任何模型
        setConfiguredProviders(new Set());
      });
  }, []);

  // 根据文件名获取文件类型
  const getFileType = (fileName: string): keyof typeof FileTypeIconMap => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'pptx' || ext === 'ppt') return 'pptx';
    if (ext === 'md') return 'md';

    return 'docx';
  };

  const handleFilesDropped = useCallback((fileList: FileList) => {
    const newFiles: FileItem[] = Array.from(fileList).map((file) => ({
      file,
      fileName: file.name,
      fileType: getFileType(file.name),
      id: `${Date.now()}-${Math.random()}`,
      cacheStatus: "uploading" as const,
    }));

    setPendingFiles((prev) => [...prev, ...newFiles]);

    void Promise.all(
      newFiles.map(async (item) => {
        try {
          const cachedPath = await uploadAgentAttachmentCache(agentId, item.file);
          setPendingFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, cachedPath, cacheStatus: "ready" as const }
                : f,
            ),
          );
        } catch {
          setPendingFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? {
                    ...f,
                    cacheStatus: "error" as const,
                    cacheError: "上传失败",
                  }
                : f,
            ),
          );
        }
      }),
    );
  }, [agentId]);

  // 知识库拖拽插入提及
  const handleMentionDropped = useCallback((mention: MentionItem) => {
    setPendingMention(mention);
  }, []);

  // 文件拖拽
  const [pendingMention, setPendingMention] = useState<MentionItem | null>(null);
  const chatInputRef = useRef<{ insertMention: (mention: MentionItem) => void }>(null);
  const { isDragging, dragOverlayKind, dragHandlers } = useFileDragAndDrop(
    handleFilesDropped,
    handleMentionDropped,
  );

  // 消费待插入的知识库提及
  useEffect(() => {
    if (!pendingMention) return;
    chatInputRef.current?.insertMention(pendingMention);
    setPendingMention(null);
  }, [pendingMention]);

  // 删除文件
  const handleFileRemove = (id: string) => {
    setPendingFiles((prev) => prev.filter(item => item.id !== id));
  };

  const handleSendWithFiles = async () => {
    if (pendingFiles.some((f) => f.cacheStatus === "uploading")) {
      return;
    }
    const attachmentPaths = pendingFiles
      .map((f) => f.cachedPath)
      .filter((p): p is string => Boolean(p));
    if (pendingFiles.length > 0 && attachmentPaths.length === 0) {
      return;
    }

    const payload = {
      text: input.trim() || undefined,
      mentions: mentions.length > 0 ? mentions : undefined,
      attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined,
      provider: modelOption.provider,
      model: modelOption.model,
    };

    setInput("");
    setMentions([]);
    setPendingFiles([]);

    await handleSend(payload);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ChatHeader />
      <div
        className="relative flex-1 min-h-0 min-w-0 flex flex-col"
        {...dragHandlers}
      >
        {isDragging && <DragOverlay kind={dragOverlayKind} />}

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {messages.length === 0 && isCollapsed ? (
            <DashboardHero />
          ) : (
            <ScrollArea className="min-h-0 min-w-0 flex-1 border bg-neutral-50">
              <div className="w-full min-w-0 max-w-full p-4">
                <ChatMessage messages={messages} />
              </div>
            </ScrollArea>
          )}
          <div className="flex min-w-0 flex-col border p-4 bg-background">
            <ChatInput
              ref={chatInputRef}
              value={input}
              onChange={setInput}
              onSend={handleSendWithFiles}
              mentions={mentions}
              onMentionsChange={setMentions}
              files={pendingFiles}
              onFilesDropped={handleFilesDropped}
              onFileRemove={handleFileRemove}
              isSending={isSending}
              agentId={agentId}
              modelOption={modelOption}
              onModelChange={setModelOption}
              modelOptions={availableModelOptions}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

