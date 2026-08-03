/**
 * Management 面板 API 封装
 */

import { http } from "./http";

export interface AgentSummary {
  id: string;
  name: string;
  locked: boolean;
  model: string;
  session_count: number;
  last_reply_time: string | null;
  last_session_title: string | null;
}

export interface AgentsSummaryResponse {
  agents: AgentSummary[];
}

/** 获取所有非 admin 智能体的聚合摘要 */
export async function fetchAgentsSummary(): Promise<AgentSummary[]> {
  const data = await http.get<AgentsSummaryResponse>(
    "/api/management/agents-summary",
  );
  return data.agents ?? [];
}

export interface CreateAgentResponse {
  ok: boolean;
  agent?: { id: string; name: string };
  error?: string;
  error_code?: string;
}

/** 创建自定义智能体 */
export async function createAgent(
  name: string,
  description?: string,
): Promise<CreateAgentResponse> {
  return http.post<CreateAgentResponse>("/api/agents", {
    name,
    description: description?.trim() || undefined,
  });
}

export interface DeleteAgentResponse {
  ok: boolean;
  error?: string;
}

/** 删除自定义智能体 */
export async function deleteAgent(agentId: string): Promise<DeleteAgentResponse> {
  return http.delete<DeleteAgentResponse>(`/api/agents/${agentId}`);
}
