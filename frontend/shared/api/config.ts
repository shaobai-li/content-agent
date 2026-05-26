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
