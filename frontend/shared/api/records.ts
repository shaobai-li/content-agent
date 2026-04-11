/**
 * Agent 知识库 nodes（nodes.json）API
 */

import { http } from "./http";

function isFolderNode(n: unknown): boolean {
  return (
    typeof n === "object" &&
    n !== null &&
    (n as { node_type?: string }).node_type === "folder"
  );
}

export const fetchNmRecords = () => http.get("/api/agents/nm/res/nodes");

export const fetchKbRecords = () =>
  http
    .get<{ nodes?: unknown[] }>("/api/agents/kb/res/nodes")
    .then((res) => ({
      nodes: (res.nodes ?? []).filter((n) => !isFolderNode(n)),
    }));

export const deleteKbRecord = (recordId: string) =>
  http.delete(`/api/agents/kb/res/nodes/${recordId}`);

export const deleteNmRecord = (recordId: string) =>
  http.delete(`/api/agents/nm/res/nodes/${recordId}`);
