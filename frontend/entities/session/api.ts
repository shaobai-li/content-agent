/**
 * Agent sessions APIs
 */

import { http } from "@/shared/api/http";
import type { Session } from "@/entities/session/model";

export const fetchSessions = (agentId: string): Promise<Session[]> =>
  http.get(`/api/agents/${agentId}/sessions`);

export const deleteSession = (agentId: string, sessionId: string): Promise<void> =>
  http.delete(`/api/agents/${agentId}/sessions/${sessionId}`);
