/**
 * Agent sessions APIs
 */

import { http } from "./http";
import type { SessionListItem } from "@/types/chat";

export const fetchSessions = (agentId: string): Promise<SessionListItem[]> =>
  http.get(`/api/${agentId}/sessions`);
