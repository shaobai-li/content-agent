/**
 * API 配置
 * 所有 agent 的 API 端点都遵循统一的模式
 */

export const API_BASE_URL = "http://localhost:8000/api";

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

/**
 * API 端点模式
 * 
 * 聊天端点: /api/{agentId}/chat
 * 数据端点: /api/{agentId}/records
 * 
 * 示例:
 * - POST /api/nm/chat          - 笔记管理聊天
 * - GET  /api/nm/records       - 获取笔记记录
 * - POST /api/kb/chat          - 知识库聊天
 * - GET  /api/kb/records       - 获取知识库记录
 */

export function getChatEndpoint(agentId: string): string {
  return `${API_BASE_URL}/${agentId}/chat`;
}

export function getRecordsEndpoint(agentId: string): string {
  return `${API_BASE_URL}/${agentId}/records`;
}

export function getSessionsEndpoint(agentId: string): string {
  return `${API_BASE_URL}/${agentId}/sessions`;
}
