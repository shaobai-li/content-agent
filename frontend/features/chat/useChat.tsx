"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, FileMessage, MessagePart } from "@/entities/message/model";
import type { MentionItem } from "./MentionChip";
import { fetchMessages } from "@/entities/session/api";
import { readStreamLines } from "./fetchStream";
import { authHeaders } from "@/shared/api/http";

/** 兜底：后端未返回 hint 时从原始参数生成（旧会话兼容） */
function _legacyToolHint(tc: { function?: { name?: string; arguments?: string } }): string {
  const name = tc.function?.name || "tool";
  let args: Record<string, unknown> = {};
  try {
    if (tc.function?.arguments) args = JSON.parse(tc.function.arguments);
  } catch { /* ignore */ }
  const first = Object.values(args).find((v): v is string => typeof v === "string" && !!v);
  return first ? `${name} (${first.length > 40 ? first.slice(0, 39) + "…" : first})` : name;
}

interface UseChatProps {
  agentId: string;
  apiEndpoint: string;
}

export type SendPayload = {
  text?: string;
  mentions?: MentionItem[];
  /** 已持久化到服务端 local_data/cache 的绝对路径列表 */
  attachmentPaths?: string[];
  /** 旧逻辑：随 chat/stream  multipart 上传（未预缓存时） */
  attachments?: File[];
  /** LLM 供应商名称 */
  provider?: string;
  /** LLM 模型名称 */
  model?: string;
};

/** 模块级缓存：组件实例复用时按 agentId 隔离聊天状态 */
const chatStateCache = new Map<string, {
  messages: Message[];
  currentSessionId: string | null;
  input: string;
}>();

export function useChat({ agentId, apiEndpoint }: UseChatProps) {
  const [input, setInput] = useState(() => chatStateCache.get(agentId)?.input ?? "");
  const [messages, setMessages] = useState<Message[]>(() => chatStateCache.get(agentId)?.messages ?? []);
  const [isSending, setIsSending] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    () => chatStateCache.get(agentId)?.currentSessionId ?? null,
  );

  // 用 ref 追踪最新状态，供 effect cleanup 读取
  const latestStateRef = useRef({ messages, currentSessionId, input });
  latestStateRef.current = { messages, currentSessionId, input };

  // 检测 agentId 切换：保存上一个 agent 的状态，恢复当前 agent 的状态
  const prevAgentRef = useRef(agentId);
  useEffect(() => {
    const prev = prevAgentRef.current;
    if (prev !== agentId) {
      chatStateCache.set(prev, latestStateRef.current);
      const cached = chatStateCache.get(agentId);
      if (cached) {
        setMessages(cached.messages);
        setCurrentSessionId(cached.currentSessionId);
        setInput(cached.input);
      } else {
        setMessages([]);
        setCurrentSessionId(null);
        setInput("");
      }
    }
    prevAgentRef.current = agentId;

    // cleanup：组件卸载或 agentId 再次变化时保存当前状态
    return () => {
      chatStateCache.set(agentId, latestStateRef.current);
    };
  }, [agentId]);

  const streamEndpoint = `${apiEndpoint}/stream`;

  /** 移除尾部 thinking part */
  function stripThinking(parts: MessagePart[]): MessagePart[] {
    if (parts.length > 0 && parts[parts.length - 1].type === "thinking") {
      return parts.slice(0, -1);
    }
    return parts;
  }

  /** 确保尾部有 thinking part（无则追加） */
  function ensureThinking(parts: MessagePart[]): MessagePart[] {
    if (parts.length > 0 && parts[parts.length - 1].type === "thinking") {
      return parts;
    }
    return [...parts, { type: "thinking" }];
  }

  const handleSend = useCallback(async (payload: SendPayload) => {
    const { text, mentions, attachments, attachmentPaths } = payload;

    const hasContent =
      text?.trim() ||
      (mentions && mentions.length > 0) ||
      (attachmentPaths && attachmentPaths.length > 0) ||
      (attachments && attachments.length > 0);
    if (!hasContent) {
      return;
    }

    const hasPreCached = attachmentPaths && attachmentPaths.length > 0;
    const hasLegacyFiles = attachments && attachments.length > 0;
    const hasFiles = Boolean(hasPreCached || hasLegacyFiles);

    const fileMessageIds: string[] = hasLegacyFiles
      ? attachments!.map(() => crypto.randomUUID())
      : [];

    const assistantMsgId = crypto.randomUUID();

    setMessages((prev) => {
      const newMessages: Message[] = [...prev];

      if (text?.trim()) {
        newMessages.push({
          id: crypto.randomUUID(),
          role: "user",
          content: text,
        });
      }

      if (hasPreCached && attachmentPaths) {
        const names = attachmentPaths
          .map((p) => p.replace(/\\/g, "/").split("/").pop() || p)
          .join(", ");
        newMessages.push({
          id: crypto.randomUUID(),
          role: "user",
          content: names ? `附件: ${names}` : "附件",
        });
      } else if (hasLegacyFiles && attachments) {
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

      newMessages.push({
        id: assistantMsgId,
        role: "assistant",
        content: "",
        parts: [{ type: "thinking" }],
      });

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
    if (attachmentPaths && attachmentPaths.length > 0) {
      formData.append("attachment_paths", JSON.stringify(attachmentPaths));
    }
    if (attachments && !attachmentPaths?.length) {
      attachments.forEach((file) => formData.append("attachments", file));
    }
    formData.append("agent_id", agentId);
    if (currentSessionId) {
      formData.append("session_id", currentSessionId);
    }
    if (payload.provider) formData.append("provider", payload.provider);
    if (payload.model) formData.append("model", payload.model);

    console.log("[session_id 验证] 发送前 currentSessionId:", currentSessionId);

    try {
      const response = await fetch(streamEndpoint, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (fileMessageIds.length > 0) {
        updateFileMsg({ status: "processing", progress: 0 });
      }

      for await (const event of readStreamLines(response)) {
        switch (event.event) {
          case "chunk":
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const clean = stripThinking(m.parts || []);
                const parts = [...clean];
                const last = parts[parts.length - 1];
                if (last?.type === "text") {
                  parts[parts.length - 1] = { ...last, content: last.content + event.data.content };
                } else {
                  parts.push({ type: "text", content: event.data.content });
                }
                return { ...m, parts };
              })
            );
            break;
          case "tool_exec_start":
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      parts: [
                        ...stripThinking(m.parts || []),
                        {
                          type: "trace",
                          title: event.data.hint || event.data.name,
                          content: "",
                          complete: false,
                        },
                      ],
                    }
                  : m
              )
            );
            break;
          case "tool_exec_end":
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const clean = stripThinking(m.parts || []);
                const parts = [...clean];
                const lastIdx = parts.length - 1;
                if (lastIdx >= 0 && parts[lastIdx].type === "trace") {
                  const status = event.data.status;
                  const content =
                    status === "error" && event.data.error
                      ? `❌ ${event.data.error}`
                      : "执行成功";
                  parts[lastIdx] = { ...parts[lastIdx], content, complete: true };
                }
                return { ...m, parts: [...parts, { type: "thinking" }] };
              })
            );
            break;
          case "done": {
            const { session_id: newSessionId, article } = event.data;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, parts: stripThinking(m.parts || []) }
                  : m
              )
            );

            console.log("[session_id 验证] 响应 session_id:", newSessionId);
            if (newSessionId) setCurrentSessionId(newSessionId as string);

            if (article) {
              localStorage.setItem(`agent-${agentId}-article`, article as string);
              window.dispatchEvent(
                new CustomEvent("article-update", {
                  detail: { agentId, article },
                })
              );
            }

            if (hasFiles && agentId === "std") {
              console.log("触发知识库数据刷新事件");
              window.dispatchEvent(new CustomEvent("kb-data-refresh"));
            }

            if (fileMessageIds.length > 0) {
              updateFileMsg({ status: "done", progress: 100 });
            }

            window.dispatchEvent(new CustomEvent("session-refresh"));
            break;
          }
          case "canvas_card":
            if (!event.data || typeof event.data.content !== "string") break;
            window.dispatchEvent(
              new CustomEvent("canvas-card", {
                detail: {
                  agentId,
                  content: event.data.content,
                  cardType: event.data.type || "html",
                  title: event.data.title ?? "",
                },
              })
            );
            break;
        }
      }
    } catch (error) {
      console.error("发送失败:", error);
      if (fileMessageIds.length > 0) {
        updateFileMsg({ status: "error", progress: 0 });
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: "出错了，请检查后端服务是否启动。",
                parts: [],
              }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }, [agentId, streamEndpoint, currentSessionId]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const rawMessages = await fetchMessages(agentId, sessionId);
      const msgs: Message[] = [];
      // tool_call_id → { msgIdx, partIdx } 映射，用于精确匹配工具结果
      const toolCallIndexMap = new Map<string, { msgIdx: number; partIdx: number }>();

      for (const m of rawMessages) {
        if (m.role === "assistant") {
          const parts: MessagePart[] = [];
          if (m.content) parts.push({ type: "text", content: m.content });
          if (m.tool_calls) {
            for (const tc of m.tool_calls) {
              const hint = tc.hint ?? _legacyToolHint(tc);
              const partIdx = parts.length;
              parts.push({
                type: "trace",
                title: hint,
                content: "",
                complete: true,
              });
              if (tc.id) {
                toolCallIndexMap.set(tc.id, { msgIdx: msgs.length, partIdx });
              }
            }
          }
          msgs.push({ id: m.message_id, role: "assistant", content: "", parts });
        } else if (m.role === "tool") {
          // 工具结果 — 通过 tool_call_id 匹配对应的 trace part，标记完成
          const entry = m.tool_call_id ? toolCallIndexMap.get(m.tool_call_id) : undefined;
          if (entry && entry.msgIdx < msgs.length) {
            const targetMsg = msgs[entry.msgIdx];
            if (targetMsg.role === "assistant" && targetMsg.parts && entry.partIdx < targetMsg.parts.length) {
              const parts = [...targetMsg.parts];
              const trace = parts[entry.partIdx];
              if (trace.type === "trace") {
                const resultText = m.content ?? "";
                const isError = resultText.startsWith("Error");
                const content = isError
                  ? `❌ ${resultText.slice(0, 200)}`
                  : "执行成功";
                parts[entry.partIdx] = { ...trace, content, complete: true };
                msgs[entry.msgIdx] = { ...targetMsg, parts };
              }
            }
          }
        } else {
          msgs.push({ id: m.message_id, role: m.role as Message["role"], content: m.content ?? "" });
        }
      }

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

  return {
    input,
    setInput,
    messages,
    handleSend,
    isSending,
    loadSession,
    startNewSession,
    currentSessionId,
  };
}
