"use client";

import { useCallback, useState } from "react";
import type { ChatMessage } from "@/types/chat";

export function useChat({ agentId }: { agentId: string }) {
  // 1. 定义状态：input 存储输入内容，messages 存储对话历史
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好！请发送你想分析的小红书笔记。" },
  ]);

  // 2. 定义发送逻辑（MVP：只做最小可用，不做过度抽象）
  const handleSend = useCallback(async () => {
    if (!input.trim()) return; // 输入为空则不发送

    // 先把用户的消息加到界面上
    const currentInput = input; // 备份输入
    setMessages((prev) => [...prev, { role: "user", content: currentInput }]);
    setInput(""); // 清空输入框

    try {
      // 3. 调用后端 Python 接口
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: currentInput,
          agent_id: agentId,
        }),
      });

      const data = await response.json();

      // 4. 将后端返回的 AI 回复加入界面
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data?.reply ?? "" },
      ]);
    } catch (error) {
      console.error("发送失败:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "出错了，请检查后端服务是否启动。" },
      ]);
    }
  }, [agentId, input]);

  return { input, setInput, messages, handleSend };
}