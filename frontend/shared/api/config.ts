/**
 * API 配置
 * 所有 agent 的 API 端点都遵循统一的模式
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Agent ID 映射
 * 简短的 agentId 用于构建 API 路径
 */
export const AGENT_IDS = {
  NOTE_MANAGER: "nm",           // 笔记管理
  KNOWLEDGE_BASE: "kb",         // 知识库
  CONTENT_DETECTION: "c",       // 内容检测
  WRITE_AGENT: "w",            // 写作助手
} as const;