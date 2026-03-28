"use client";

import { useEffect, useState } from "react";
import { useChat } from "@/features/chat/useChat";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { ChatInput, type FileItem } from "./ChatInput";
import type { MentionItem } from "./MentionChip";
import { FileTypeIconMap } from "@/shared/ui/icons";
import { ScrollArea } from "@/shared/ui/scroll-area";

interface ChatPageProps {
  agentId: string; // 简短的agent标识，用于构建API端点
}

export function ChatPage({ agentId }: ChatPageProps) {
  // 根据 agentId 自动构建 API 端点
  const apiEndpoint = `http://localhost:8000/api/agents/${agentId}/chat`;
  
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

  // 根据文件名获取文件类型
  const getFileType = (fileName: string): keyof typeof FileTypeIconMap => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'pptx' || ext === 'ppt') return 'pptx';
    if (ext === 'md') return 'md';
    
    return 'docx';
  };

  // 处理文件拖拽
  const handleFilesDropped = (fileList: FileList) => {
    console.log("Files dropped, generating FILE objects:", fileList);
    
    const newFiles: FileItem[] = Array.from(fileList).map((file) => {
      const fileItem: FileItem = {
        file, // 保存原始 File 对象
        fileName: file.name,
        fileType: getFileType(file.name),
        id: `${Date.now()}-${Math.random()}`, // 生成唯一ID
      };
      
      console.log("Generated FILE object:", {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
      
      return fileItem;
    });

    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  // 删除文件
  const handleFileRemove = (id: string) => {
    setPendingFiles((prev) => prev.filter(item => item.id !== id));
  };

  // 统一的发送处理函数
  const handleSendWithFiles = async () => {
    // 构建发送负载
    const payload = {
      text: input.trim() || undefined,
      mentions: mentions.length > 0 ? mentions : undefined,
      attachments: pendingFiles.length > 0 
        ? pendingFiles.map(item => item.file) 
        : undefined,
      meta: {
        clientMessageId: `${Date.now()}-${Math.random()}`,
      },
    };

    // 立即清空输入、提及和文件列表（用户体验更好）
    setInput("");
    setMentions([]);
    setPendingFiles([]);

    // 调用 useChat 的 handleSend
    await handleSend(payload);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader />
      <div className="flex-1 min-h-0 flex flex-col">
        <ScrollArea className="flex-1 min-h-0 border p-4 bg-neutral-50">
          <ChatMessage messages={messages} />
        </ScrollArea>
        <div className="flex flex-col border p-4 bg-background">
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
          />
        </div>
      </div>
    </div>
  );
}

