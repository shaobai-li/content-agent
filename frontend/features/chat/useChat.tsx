"use client";

import { useCallback, useState } from "react";
import axios from "axios";
import type { Message, FileMessage } from "@/entities/message/model";
import type { MentionItem } from "./MentionChip";
import { fetchMessages } from "@/entities/session/api";
import { readStreamLines } from "./fetchStream";


interface UseChatProps {
  agentId: string;
  apiEndpoint: string;
}

export type SendPayload = {
  text?: string;
  mentions?: MentionItem[];
  attachments?: File[];
};

export function useChat({ agentId, apiEndpoint }: UseChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const streamEndpoint = `${apiEndpoint}/stream`;
  

  const handleSend = useCallback(async (payload: SendPayload) => {
    const { text, mentions, attachments } = payload;

    const hasContent = text?.trim() || (mentions && mentions.length > 0) || (attachments && attachments.length > 0);
    if (!hasContent) {
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
    if (mentions && mentions.length > 0) {
      formData.append("mentions", JSON.stringify(mentions));
    }
    if (attachments) {
      attachments.forEach((file) => formData.append("attachments", file));
    }
    formData.append("agent_id", agentId);
    if (currentSessionId) {
      formData.append("session_id", currentSessionId);
    }

    console.log("[session_id 验证] 发送前 currentSessionId:", currentSessionId);

    try {
      if (hasFiles) {
        // 文件上传路径：axios 提供上传进度，后端返回 JSON
        const response = await axios.post(apiEndpoint, formData, {
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 70);
              updateFileMsg({ progress: pct });
            }
          },
        });
        const data = response.data;

        updateFileMsg({ status: "processing", progress: 80 });
        updateFileMsg({ status: "done", progress: 100 });

        const newSessionId = data?.session_id;
        console.log("[session_id 验证] 响应 session_id:", newSessionId);
        if (newSessionId) setCurrentSessionId(newSessionId);

        if (agentId === "kb") {
          console.log("触发知识库数据刷新事件");
          window.dispatchEvent(new CustomEvent("kb-data-refresh"));
        }

        window.dispatchEvent(new CustomEvent("session-refresh"));
      } else {
        // 文本对话路径：流式输出，逐 token 追加
        const assistantMsgId = crypto.randomUUID();
        setMessages((prev) => [...prev, {
          id: assistantMsgId,
          role: "assistant",
          content: "",
        }]);

        const response = await fetch(streamEndpoint, {
          method: "POST",
          body: formData,
        });

        for await (const event of readStreamLines(response)) {
          switch (event.event) {
            case "chunk":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.data.content }
                    : m
                )
              );
              break;
            case "thinking_start":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, thinking: "", metadata: { ...m.metadata, thinkingComplete: false } }
                    : m
                )
              );
              break;
            case "thinking_chunk":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, thinking: (m.thinking || "") + event.data.content }
                    : m
                )
              );
              break;
            case "thinking_end":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, metadata: { ...m.metadata, thinkingComplete: true } }
                    : m
                )
              );
              break;
            case "plan_start":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, plan: [], metadata: { ...m.metadata, planComplete: false } }
                    : m
                )
              );
              break;
            case "plan_item":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, plan: [...(m.plan || []), event.data.step] }
                    : m
                )
              );
              break;
            case "plan_end":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, metadata: { ...m.metadata, planComplete: true } }
                    : m
                )
              );
              break;
            case "done":
              {
                const { session_id: newSessionId, article } = event.data;

                console.log("[session_id 验证] 响应 session_id:", newSessionId);
                if (newSessionId) setCurrentSessionId(newSessionId as string);

                if (article) {
                  localStorage.setItem(`agent-${agentId}-article`, article as string);
                  window.dispatchEvent(new CustomEvent("article-update", {
                    detail: { agentId, article },
                  }));
                }

                window.dispatchEvent(new CustomEvent("session-refresh"));
              }
              break;
          }
        }
      }
    } catch (error) {
      console.error("发送失败:", error);
      if (fileMessageIds.length > 0) {
        updateFileMsg({ status: "error", progress: 0 });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "出错了，请检查后端服务是否启动。",
          },
        ]);
      }
    } finally {
      setIsSending(false);
    }
  }, [agentId, apiEndpoint, streamEndpoint, currentSessionId]);

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
