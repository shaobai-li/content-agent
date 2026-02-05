"use client";

import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "./ChatHeader";
import { ChatMessage } from "./ChatMessage";
import { ChatInput, type FileItem } from "./ChatInput";

interface ChatPageProps {
  agentId: string; // 简短的agent标识，用于构建API端点
  // 文件管理（可选）
  files?: FileItem[];
  onFileRemove?: (index: number) => void;
}

export function ChatPage({ agentId, files, onFileRemove }: ChatPageProps) {
  // 根据 agentId 自动构建 API 端点
  const apiEndpoint = `http://localhost:8000/api/${agentId}/chat`;
  
  const { input, setInput, messages, handleSend } = useChat({ 
    agentId, 
    apiEndpoint 
  });

  return (
    <div className="w-100 flex flex-col">
      <ChatHeader />
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col border p-4 bg-neutral-50">
          <ChatMessage messages={messages} />
        </div>
        <div className="flex flex-col border p-4 bg-background">
          <ChatInput 
            value={input} 
            onChange={setInput} 
            onSend={handleSend}
            files={files}
            onFileRemove={onFileRemove}
          />
        </div>
      </div>
    </div>
  );
}

