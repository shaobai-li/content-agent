/**
 * Agent 知识库 nodes（nodes.json）API
 */

import { http } from "./http";

type KbNode = {
  id?: string;
  parent_id?: string | null;
  node_type?: string;
  [key: string]: unknown;
};

function flattenKbNodes(nodes: KbNode[]): KbNode[] {
  const byParent = new Map<string | null, KbNode[]>();
  const nodeById = new Map<string, KbNode>();
  const ordered: KbNode[] = [];
  const visited = new Set<string>();

  nodes.forEach((node) => {
    if (typeof node.id === "string" && node.id.length > 0) {
      nodeById.set(node.id, node);
    }
  });

  nodes.forEach((node) => {
    const parentId = typeof node.parent_id === "string" ? node.parent_id : null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(node);
    byParent.set(parentId, bucket);
  });

  const sortNodes = (list: KbNode[]) =>
    [...list].sort((a, b) => {
      const aFolder = a.node_type === "folder" ? 0 : 1;
      const bFolder = b.node_type === "folder" ? 0 : 1;
      if (aFolder !== bFolder) return aFolder - bFolder;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });

  const walk = (node: KbNode, depth: number) => {
    if (node.id === "fld_root") {
      const rootChildren = sortNodes(byParent.get("fld_root") ?? []);
      rootChildren.forEach((child) => walk(child, 0));
      return;
    }

    if (typeof node.id === "string") {
      if (visited.has(node.id)) return;
      visited.add(node.id);
    }

    ordered.push({ ...node, _depth: depth });

    if (typeof node.id !== "string") return;
    const children = sortNodes(byParent.get(node.id) ?? []);
    children.forEach((child) => walk(child, depth + 1));
  };

  const topLevel = sortNodes(
    nodes.filter((node) => {
      if (node.id === "fld_root") return true;
      const parentId = typeof node.parent_id === "string" ? node.parent_id : null;
      if (parentId === null) return true;
      return !nodeById.has(parentId);
    })
  );
  topLevel.forEach((node) => walk(node, 0));

  return ordered;
}

export const fetchNmRecords = () => http.get("/api/agents/nm/res/nodes");

export const fetchKbRecords = () =>
  http
    .get<{ nodes?: KbNode[] }>("/api/agents/kb/res/nodes")
    .then((res) => ({
      nodes: flattenKbNodes(res.nodes ?? []),
    }));

export const deleteKbRecord = (recordId: string) =>
  http.delete(`/api/agents/kb/res/nodes/${recordId}`);

export const deleteNmRecord = (recordId: string) =>
  http.delete(`/api/agents/nm/res/nodes/${recordId}`);
