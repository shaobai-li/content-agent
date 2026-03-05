"use client";

import { useCallback, useState } from "react";
import axios from "axios";
import type { Message, FileMessage } from "@/entities/message/model";
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

    const hasFiles = attachments && attachments.length > 0;

    const fileMessageIds: string[] = hasFiles
      ? attachments!.map(() => crypto.randomUUID())
      : [];

    setMessages((prev) => {
      const newMessages: Message[] = [...prev];

      if (text?.trim()) {
        newMessages.push({
          id: crypto.randomUUID(),
          role: "user",
          content: text,
        });
      }

      if (hasFiles && attachments) {
        const fileNames = attachments.map((f) => f.name).join(", ");
        newMessages.push({
          id: crypto.randomUUID(),
          role: "user",
          content: `附件: ${fileNames}`,
        });
        attachments.forEach((file, i) => {
          newMessages.push({
            id: fileMessageIds[i],
            role: "assistant",
            content: "",
            type: "file",
            fileName: file.name,
            status: "uploading",
            progress: 0,
          } as FileMessage);
        });
      }

      return newMessages;
    });
    setIsSending(true);

    const updateFileMsg = (updates: Partial<FileMessage>) => {
      if (fileMessageIds.length === 0) return;
      setMessages((prev) =>
        prev.map((msg) =>
          fileMessageIds.includes(msg.id) ? { ...msg, ...updates } : msg
        )
      );
    };

    const formData = new FormData();
    if (text?.trim()) formData.append("text", text);
    if (attachments) {
      attachments.forEach((file) => formData.append("attachments", file));
    }
    formData.append("agent_id", agentId);
    if (currentSessionId) {
      formData.append("session_id", currentSessionId);
    }

    console.log("[session_id 验证] 发送前 currentSessionId:", currentSessionId);

    try {
      let data;
      
      if (fileMessageIds.length > 0) {
        const response = await axios.post(apiEndpoint, formData, {
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 70);
              updateFileMsg({ progress: pct });
            }
          },
        });
        data = response.data;

        updateFileMsg({ status: "processing", progress: 80 });
        updateFileMsg({ status: "done", progress: 100 });
      } else {
        const response = await fetch(apiEndpoint, {
          method: "POST",
          body: formData,
        });
        data = await response.json();
      }

      const newSessionId = data?.session_id;
      console.log("[session_id 验证] 响应 session_id:", newSessionId);
      if (newSessionId) {
        setCurrentSessionId(newSessionId);
      }

      if (data?.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.reply,
          },
        ]);
      }

      if (data?.article) {
        localStorage.setItem(`agent-${agentId}-article`, data.article);
        window.dispatchEvent(new CustomEvent("article-update", {
          detail: { agentId, article: data.article },
        }));
      }

      if (attachments && attachments.length > 0 && agentId === "kb") {
        console.log("触发知识库数据刷新事件");
        window.dispatchEvent(new CustomEvent("kb-data-refresh"));
      }

      window.dispatchEvent(new CustomEvent("session-refresh"));
    } catch (error) {
      console.error("发送失败:", error);
      if (fileMessageIds.length > 0) {
        updateFileMsg({ status: "error", progress: 0 });
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "出错了，请检查后端服务是否启动。",
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