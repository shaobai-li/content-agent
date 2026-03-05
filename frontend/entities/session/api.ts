/**
 * Agent sessions APIs
 */

import { http } from "@/shared/api/http";
import type { Session, SessionMessage } from "@/entities/session/model";

export const fetchSessions = (agentId: string): Promise<Session[]> =>
  http.get(`/api/agents/${agentId}/sessions`);

export const deleteSession = (agentId: string, sessionId: string): Promise<void> =>
  http.delete(`/api/agents/${agentId}/sessions/${sessionId}`);

export const fetchMessages = (agentId: string, sessionId: string): Promise<SessionMessage[]> =>
  http.get(`/api/agents/${agentId}/sessions/${sessionId}/messages`);
