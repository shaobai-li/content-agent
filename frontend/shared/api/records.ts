/**
 * Agent 知识库 nodes（nodes.json）API
 */

import { http } from "./http";

type KbNode = {
  id?: string;
  node_type?: string;
  parent_id?: string | null;
  [key: string]: unknown;
};

type KbTableNode = KbNode & {
  _depth: number;
};

type CreateKbFolderResponse = {
  success: boolean;
  message?: string;
  folder?: KbNode;
};

function isKbNode(node: unknown): node is KbNode {
  return typeof node === "object" && node !== null;
}

function buildKbTableNodes(nodes: unknown[]): KbTableNode[] {
  const validNodes = nodes.filter(isKbNode);
  const childrenByParent = new Map<string | null, KbNode[]>();
  const nodeIds = new Set<string>();
  const visited = new Set<string>();
  const flattened: KbTableNode[] = [];

  for (const node of validNodes) {
    if (typeof node.id === "string") {
      nodeIds.add(node.id);
    }

    const parentId = typeof node.parent_id === "string" ? node.parent_id : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(parentId, siblings);
  }

  const appendNode = (node: KbNode, depth: number) => {
    if (typeof node.id === "string") {
      if (visited.has(node.id)) return;
      visited.add(node.id);
    }

    flattened.push({ ...node, _depth: depth });

    if (typeof node.id !== "string") return;

    const children = childrenByParent.get(node.id) ?? [];
    for (const child of children) {
      appendNode(child, depth + 1);
    }
  };

  const rootFolder = validNodes.find(
    (node) => node.node_type === "folder" && node.parent_id == null,
  );

  if (typeof rootFolder?.id === "string") {
    const rootChildren = childrenByParent.get(rootFolder.id) ?? [];
    for (const child of rootChildren) {
      appendNode(child, 0);
    }
  } else {
    const topLevelNodes = childrenByParent.get(null) ?? [];
    for (const node of topLevelNodes) {
      appendNode(node, 0);
    }
  }

  for (const node of validNodes) {
    const parentId = typeof node.parent_id === "string" ? node.parent_id : null;
    const isOrphan = parentId !== null && !nodeIds.has(parentId);
    const isUnvisited = typeof node.id !== "string" || !visited.has(node.id);

    if (isUnvisited && isOrphan) {
      appendNode(node, 0);
    }
  }

  return flattened;
}

export const fetchKbRecords = () =>
  http
    .get<{ nodes?: unknown[] }>("/api/agents/kb/res/nodes")
    .then((res) => ({
      nodes: buildKbTableNodes(res.nodes ?? []),
    }));

export const createKbFolder = (name: string) =>
  http.post<CreateKbFolderResponse>("/api/agents/kb/res/nodes", { name });

export const deleteKbRecord = (recordId: string) =>
  http.delete(`/api/agents/kb/res/nodes/${recordId}`);
