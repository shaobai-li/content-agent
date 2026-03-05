"use client";

import { useCallback, useState } from "react";
import type { Message } from "@/entities/message/model";
import { fetchMessages } from "@/entities/session/api";


interface UseChatProps {
  agentId: string;
  apiEndpoint: string; // 每个agent使用自己的API端点
}

// 发送负载类型
export type SendPayload = {
  text?: string;        // 可选：消息文本
  attachments?: File[]; // 可选：文件附件
};

export function useChat({ agentId, apiEndpoint }: UseChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const handleSend = useCallback(async (payload: SendPayload) => {
    const { text, attachments } = payload;

    if (!text?.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    let userMessageContent = text || "";
    if (attachments && attachments.length > 0) {
      const fileNames = attachments.map(f => f.name).join(", ");
      userMessageContent += userMessageContent 
        ? `\n\n📎 附件: ${fileNames}` 
        : `📎 附件: ${fileNames}`;
    }

    setMessages((prev) => [...prev, { 
      id: `${Date.now()}-user`,
      role: "user", 
      content: userMessageContent 
    }]);
    
    setIsSending(true);

    try {
      const formData = new FormData();
      
      if (text?.trim()) {
        formData.append("text", text);
      }
      
      if (attachments && attachments.length > 0) {
        attachments.forEach((file) => {
          formData.append("attachments", file);
        });
      }
      
      formData.append("agent_id", agentId);
      if (currentSessionId) {
        formData.append("session_id", currentSessionId);
      }

      console.log("[session_id 验证] 发送前 currentSessionId:", currentSessionId);

      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData, // FormData 会自动设置正确的 Content-Type
      });

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        { 
          id: `${Date.now()}-assistant`,
          role: "assistant", 
          content: data?.reply ?? "" 
        },
      ]);

      const newSessionId = data?.session_id;
      console.log("[session_id 验证] 响应 session_id:", newSessionId);
      if (newSessionId) {
        setCurrentSessionId(newSessionId);
      }

      if (data?.article) {
        localStorage.setItem(`agent-${agentId}-article`, data.article);
        window.dispatchEvent(new CustomEvent("article-update", { 
          detail: { agentId, article: data.article } 
        }));
      }

      if (attachments && attachments.length > 0 && agentId === "kb") {
        console.log("触发知识库数据刷新事件");
        window.dispatchEvent(new CustomEvent("kb-data-refresh"));
      }
      
      window.dispatchEvent(new CustomEvent("session-refresh"));
    } catch (error) {
      console.error("发送失败:", error);
      setMessages((prev) => [
        ...prev,
        { 
          id: `${Date.now()}-error`,
          role: "assistant", 
          content: "出错了，请检查后端服务是否启动。" 
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [agentId, apiEndpoint, currentSessionId]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const rawMessages = await fetchMessages(agentId, sessionId);
      const msgs: Message[] = rawMessages.map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
      }));
      setMessages(msgs);
      setCurrentSessionId(sessionId);
    } catch (error) {
      console.error("加载会话消息失败:", error);
    }
  }, [agentId]);

  const startNewSession = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(null);
  }, []);
  return { input, setInput, messages, handleSend, isSending, loadSession, startNewSession, currentSessionId };
}