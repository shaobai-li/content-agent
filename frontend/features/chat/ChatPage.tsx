"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useChat } from "@/features/chat/useChat";
import type { Message } from "@/entities/message/model";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { DashboardHero } from "./DashboardHero";
import { ChatInput, type FileItem, type ModelOption } from "./ChatInput";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { getApiBaseUrl, getUserId } from "@/shared/api/config";
import { uploadAgentAttachmentCache } from "@/shared/api/attachments";
import { Upload } from "lucide-react";
import {
  hasKnowledgeBaseDragData,
  readKnowledgeBaseDragData,
} from "@/shared/lib/dragData";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
  onTauriFilesDropped?: (paths: string[]) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverlayKind, setDragOverlayKind] = useState<DragOverlayKind>("files");

  // 用 ref 持有回调，避免 useEffect 因回调引用变化而重复执行
  const onTauriFilesDroppedRef = useRef(onTauriFilesDropped);
  onTauriFilesDroppedRef.current = onTauriFilesDropped;

  // 互斥锁：Tauri onDragDropEvent 与 HTML5 onDrop 都会触发，
  // 但只需处理第一个到的 drop 事件，另一个直接跳过
  const dropClaimedRef = useRef(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    dropClaimedRef.current = false;
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
      if (dropClaimedRef.current) return;
      dropClaimedRef.current = true;
      onMentionDropped?.(mention);
      return;
    }

    // 处理文件拖拽
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (dropClaimedRef.current) return;
      dropClaimedRef.current = true;
      onFilesDropped?.(files);
    }
    // Tauri 环境下 e.dataTransfer.files 可能为空
    // （WebView2 不传递 OS 文件到 HTML5），此时不 claim，
    // 让 Tauri onDragDropEvent 通过 Rust invoke 路径处理。
  }, [onFilesDropped, onMentionDropped]);

  // Tauri 拖拽事件监听（仅 Tauri 环境有效）
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        unlisten = await appWindow.onDragDropEvent((event: { payload: { type: string; paths: string[] } }) => {
          const { type, paths } = event.payload;

          if (type === 'enter' || type === 'over') {
            dropClaimedRef.current = false;
            setDragOverlayKind('files');
            setIsDragging(true);
          } else if (type === 'leave') {
            setIsDragging(false);
          } else if (type === 'drop') {
            setIsDragging(false);

            // 互斥：已被 HTML5 onDrop 处理则跳过
            if (dropClaimedRef.current) return;
            dropClaimedRef.current = true;

            if (paths.length > 0 && onTauriFilesDroppedRef.current) {
              onTauriFilesDroppedRef.current(paths);
            }
          }
        });
      } catch (err) {
        console.warn('Failed to set up Tauri drag-drop listener:', err);
      }
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

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

/**
 * 智能滚动定位 + 底部空白"弹性折叠" hook
 *
 * 滚动策略：
 * 1. 用户发送 → 展开 50vh 空白作为滚动余量，定位 lastUser 消息到视口最上方
 * 2. AI 流式回复中 → 不自动滚动
 * 3. 回复完成 → 保持当前位置和 50vh 空白，进入"待折叠"状态
 * 4. 用户滚动页面 → 空白从 50vh 平滑收缩到 5vh 最小值，之后不再展开
 * 5. 加载历史会话 → 滚动到底部（无锚点时）
 *
 * padding 通过 viewport 子元素的内联 style 直接控制，绕开 React state 异步更新延迟。
 */
function useAutoScroll(
  messages: Message[],
  isSending: boolean,
  viewportRef: React.RefObject<HTMLDivElement | null>,
) {
  const prevIsSendingRef = useRef(false);
  const anchorMsgIdRef = useRef<string | null>(null);
  const isAwaitingCollapseRef = useRef(false);

  // 获取 padding 容器（viewport 的首个子元素）
  const getPaddingEl = useCallback((vp: HTMLElement): HTMLElement | null => {
    return vp.querySelector('[data-padding-root]') as HTMLElement | null;
  }, []);

  // 展开 padding（无 transition → 瞬间生效）
  const expandPadding = useCallback((vp: HTMLElement) => {
    const el = getPaddingEl(vp);
    if (!el) return;
    el.style.transition = 'none';
    el.style.paddingBottom = '50vh';
  }, [getPaddingEl]);

  // 折叠 padding（带 transition → 平滑收缩）
  const collapsePadding = useCallback((vp: HTMLElement) => {
    const el = getPaddingEl(vp);
    if (!el) return;
    el.style.transition = 'padding-bottom 0.4s ease-out';
    el.style.paddingBottom = '5vh';
  }, [getPaddingEl]);

  // 滚动定位逻辑
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const prevIsSending = prevIsSendingRef.current;
    const sendingStarted = !prevIsSending && isSending;
    prevIsSendingRef.current = isSending;

    if (sendingStarted) {
      // 立即展开 padding（内联 style 同步生效）
      expandPadding(vp);
      isAwaitingCollapseRef.current = false;

      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUserMsg) return;

      anchorMsgIdRef.current = lastUserMsg.id;

      // 此时 DOM 中 padding 已为 50vh，scroll 有足够余量
      const el = vp.querySelector(`[data-message-id="${lastUserMsg.id}"]`) as HTMLElement | null;
      if (!el) return;
      vp.scrollTo({ top: el.offsetTop, behavior: "instant" as ScrollBehavior });
      return;
    }

    if (!isSending) {
      const sendingJustFinished = prevIsSending && anchorMsgIdRef.current !== null;
      if (sendingJustFinished) {
        // 回复完成：进入"待折叠"状态，等待用户滚动触发 padding 收缩
        isAwaitingCollapseRef.current = true;
      } else if (!anchorMsgIdRef.current && messages.length > 0) {
        // 无锚点 & 有消息：会话加载等场景 → 立即滚动到底部
        vp.scrollTo({ top: vp.scrollHeight, behavior: "instant" as ScrollBehavior });
      }
      anchorMsgIdRef.current = null;
    }
    // isSending 且非 sendingStarted（流式回复中）→ 不滚动，用户消息保持在顶部
  }, [messages, isSending, viewportRef, expandPadding]);

  // 滚动监听：用户滚动 → 折叠底部空白到 5vh 最小值
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const handleScroll = () => {
      if (isAwaitingCollapseRef.current) {
        isAwaitingCollapseRef.current = false;
        collapsePadding(vp); // 50vh → 5vh 平滑过渡
      }
    };

    vp.addEventListener('scroll', handleScroll, { passive: true });
    return () => vp.removeEventListener('scroll', handleScroll);
  }, [viewportRef, collapsePadding]);
}

export function ChatPage({ agentId }: ChatPageProps) {
  // 根据 agentId 自动构建 API 端点
  const apiEndpoint = `${getApiBaseUrl()}/api/agents/${agentId}/chat`;

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
  // 后端下发的完整模型列表
  const [allModelOptions, setAllModelOptions] = useState<ModelOption[]>([]);
  // 当前选择的 LLM 供应商和模型（"加载中..." 占位避免 "未配置" 闪烁）
  const [modelOption, setModelOption] = useState<ModelOption>({
    provider: "", provider_label: "", model: "", label: "加载中...", configured: false,
  });

  // 根据 API Key 配置过滤可用的模型选项
  const availableModelOptions = useMemo(() => {
    return allModelOptions.filter((opt) => opt.configured);
  }, [allModelOptions]);

  // 模型列表加载后自动选中第一个可用模型；当前模型不可用时切换到第一个
  useEffect(() => {
    if (availableModelOptions.length === 0) return;
    const stillAvailable = availableModelOptions.some(
      (o) => o.provider === modelOption.provider && o.model === modelOption.model,
    );
    if (!stillAvailable) {
      setModelOption(availableModelOptions[0]);
    }
  }, [availableModelOptions, modelOption]);

  const fetchModels = useCallback(() => {
    http
      .get<{ models: ModelOption[] }>("/api/settings/models")
      .then((data) => {
        setAllModelOptions(data.models ?? []);
      })
      .catch(() => {
        setAllModelOptions([]);
      });
  }, []);

  // 首次挂载拉取 + 监听 provider 配置变更事件
  useEffect(() => {
    fetchModels();
    window.addEventListener("provider-config-changed", fetchModels);
    return () => window.removeEventListener("provider-config-changed", fetchModels);
  }, [fetchModels]);

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
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useAutoScroll(messages, isSending, scrollAreaRef);

  // Tauri 拖拽：通过文件路径直接复制到缓存
  const handleTauriFilesDropped = useCallback(async (paths: string[]) => {
    const newFiles: FileItem[] = paths.map((path) => {
      const fileName = path.replace(/^.*[/\\]/, '');
      return {
        file: new File([], fileName),
        fileName,
        fileType: getFileType(fileName),
        id: `${Date.now()}-${Math.random()}`,
        cacheStatus: "uploading" as const,
      };
    });

    setPendingFiles((prev) => [...prev, ...newFiles]);

    await Promise.all(
      newFiles.map(async (item, index) => {
        try {
          const cachedPath = await invoke<string>("copy_attachment_to_cache", {
            agentId,
            sourcePath: paths[index],
            userId: getUserId() || null,
          });
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
                ? { ...f, cacheStatus: "error" as const, cacheError: "上传失败" }
                : f,
            ),
          );
        }
      }),
    );
  }, [agentId]);

  const { isDragging, dragOverlayKind, dragHandlers } = useFileDragAndDrop(
    handleFilesDropped,
    handleMentionDropped,
    handleTauriFilesDropped,
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
      provider: modelOption?.provider,
      model: modelOption?.model,
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
            <ScrollArea ref={scrollAreaRef} className="min-h-0 min-w-0 flex-1 border bg-neutral-50">
              <div data-padding-root className="w-full min-w-0 max-w-full p-4">
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

