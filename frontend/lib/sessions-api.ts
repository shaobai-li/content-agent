import { getSessionsEndpoint } from "@/lib/api-config";
import type { SessionListItem } from "@/types/chat";

export async function getSessions(agentId: string): Promise<SessionListItem[]> {
  const res = await fetch(getSessionsEndpoint(agentId));
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}
