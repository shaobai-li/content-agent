/**
 * Agent sessions APIs
 */

import { http } from "@/shared/api/http";
import type { Session } from "@/entities/session/model";

export const fetchSessions = (agentId: string): Promise<Session[]> =>
  http.get(`/api/${agentId}/sessions`);
