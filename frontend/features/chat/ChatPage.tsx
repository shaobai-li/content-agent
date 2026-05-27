"use client";

import { useEffect, useState, useMemo } from "react";
import { useChat } from "@/features/chat/useChat";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { ChatInput, type FileItem, type ModelOption, MODEL_OPTIONS } from "./ChatInput";
import type { MentionItem } from "./MentionChip";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { API_BASE_URL } from "@/shared/api/config";
import { uploadAgentAttachmentCache } from "@/shared/api/attachments";
import { http } from "@/shared/api/http";

interface ChatPageProps {
  agentId: string; // 简短的agent标识，用于构建API端点
}

export function ChatPage({ agentId }: ChatPageProps) {
  // 根据 agentId 自动构建 API 端点
  const apiEndpoint = `${API_BASE_URL}/api/agents/${agentId}/chat`;
  
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

  const handleFilesDropped = (fileList: FileList) => {
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
  };

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
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <ScrollArea className="min-h-0 min-w-0 flex-1 border bg-neutral-50">
          <div className="w-full min-w-0 max-w-full p-4">
            <ChatMessage messages={messages} />
          </div>
        </ScrollArea>
        <div className="flex min-w-0 flex-col border p-4 bg-background">
          <ChatInput
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
  );
}

