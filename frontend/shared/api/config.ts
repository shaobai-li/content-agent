/**
 * API 配置
 * 所有 agent 的 API 端点都遵循统一的模式
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * 运行时获取 API base URL。
 * Tauri 环境下直连 Rust 后端（8001），
 * 浏览器/Vite 环境下走 Vite proxy（同源请求，返回空字符串或原始 API_BASE_URL）。
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return "http://localhost:8001";
  }
  return API_BASE_URL;
}

/**
 * Agent ID 映射
 * 简短的 agentId 用于构建 API 路径
 */
export const AGENT_IDS = {
  STANDARD: "std",
  WRITE_AGENT: "w",
} as const;

/**
 * 从 localStorage 恢复 user_id，用于 X-User-Id header。
 * user 在 AuthProvider 登录成功后持久化到 localStorage('auth-user')。
 */
export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('auth-user');
    if (!raw) return null;
    const user = JSON.parse(raw) as { id: number };
    return String(user.id);
  } catch {
    return null;
  }
}
