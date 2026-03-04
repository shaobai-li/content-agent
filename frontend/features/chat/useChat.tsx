"use client";

import { useCallback, useState } from "react";
import type { Message } from "@/entities/message/model";

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
  // 1. 定义状态：input 存储输入内容，messages 存储对话历史
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // 2. 定义统一的发送逻辑，支持文本、文件、或两者组合
  const handleSend = useCallback(async (payload: SendPayload) => {
    const { text, attachments } = payload;

    // 至少要有文本或文件
    if (!text?.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    // 构建用户消息的显示内容
    let userMessageContent = text || "";
    if (attachments && attachments.length > 0) {
      const fileNames = attachments.map(f => f.name).join(", ");
      userMessageContent += userMessageContent 
        ? `\n\n📎 附件: ${fileNames}` 
        : `📎 附件: ${fileNames}`;
    }

    // 先把用户的消息加到界面上
    setMessages((prev) => [...prev, { 
      id: `${Date.now()}-user`,
      role: "user", 
      content: userMessageContent 
    }]);
    
    // 设置发送状态
    setIsSending(true);

    try {
      // 3. 使用 FormData 构建请求体（支持 multipart/form-data）
      const formData = new FormData();
      
      // 添加文本（可选）
      if (text?.trim()) {
        formData.append("text", text);
      }
      
      // 添加文件（可选）
      if (attachments && attachments.length > 0) {
        attachments.forEach((file) => {
          formData.append("attachments", file);
        });
      }
      
      // 添加 agent_id
      formData.append("agent_id", agentId);
      if (currentSessionId) {
        formData.append("session_id", currentSessionId);
      }

      // [调试] 发送前打印当前 session_id
      console.log("[session_id 验证] 发送前 currentSessionId:", currentSessionId);

      // 4. 调用后端 API（使用 multipart/form-data）
      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData, // FormData 会自动设置正确的 Content-Type
      });

      const data = await response.json();

      // 5. 将后端返回的 AI 回复加入界面
      setMessages((prev) => [
        ...prev,
        { 
          id: `${Date.now()}-assistant`,
          role: "assistant", 
          content: data?.reply ?? "" 
        },
      ]);

      // 6. 从响应中更新 session_id，供后续消息复用
      const newSessionId = data?.session_id;
      console.log("[session_id 验证] 响应 session_id:", newSessionId);
      if (newSessionId) {
        setCurrentSessionId(newSessionId);
      }

      // 6. 如果返回了 article 内容，存储并触发 document 刷新事件
      if (data?.article) {
        localStorage.setItem(`agent-${agentId}-article`, data.article);
        window.dispatchEvent(new CustomEvent("article-update", { 
          detail: { agentId, article: data.article } 
        }));
      }

      // 7. 如果有附件上传且是知识库 agent，触发刷新事件
      if (attachments && attachments.length > 0 && agentId === "kb") {
        console.log("触发知识库数据刷新事件");
        window.dispatchEvent(new CustomEvent("kb-data-refresh"));
      }
      
      // 8. 对话已保存，触发历史列表刷新
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
      // 无论成功或失败，都要重置发送状态
      setIsSending(false);
    }
  }, [agentId, apiEndpoint, currentSessionId]);

  return { input, setInput, messages, handleSend, isSending };
}