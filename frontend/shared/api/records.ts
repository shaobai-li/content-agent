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

export type KnowledgeBaseDatabase = {
  id: string;
  name: string;
  description: string;
};

type CreateKbFolderResponse = {
  success: boolean;
  message?: string;
  folder?: KbNode;
};

type RenameKbNodeResponse = {
  success: boolean;
  message?: string;
  node?: KbNode;
};

type MoveKbNodeResponse = {
  success: boolean;
  message?: string;
  node?: KbNode;
};

type KnowledgeBaseListResponse = {
  databases?: KnowledgeBaseDatabase[];
};

type CreateKnowledgeBaseResponse = {
  success: boolean;
  message?: string;
  database?: KnowledgeBaseDatabase;
};

type DeleteKnowledgeBaseResponse = {
  success: boolean;
  message?: string;
  database?: KnowledgeBaseDatabase;
};

type DeleteKbRecordResponse = {
  success: boolean;
  message?: string;
};

function buildKbQuery(kbId?: string) {
  if (!kbId) {
    return "";
  }

  return `?kb_id=${encodeURIComponent(kbId)}`;
}

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

export const fetchKnowledgeBases = (agentId: string) =>
  http
    .get<KnowledgeBaseListResponse>(`/api/agents/${agentId}/knowledge-bases`)
    .then((res) => ({
      databases: res.databases ?? [],
    }));

export const createKnowledgeBase = (agentId: string, name: string, description: string) =>
  http.post<CreateKnowledgeBaseResponse>(`/api/agents/${agentId}/knowledge-bases`, {
    name,
    description,
  });

export const deleteKnowledgeBase = (agentId: string, kbId: string) =>
  http.delete<DeleteKnowledgeBaseResponse>(`/api/agents/${agentId}/knowledge-bases/${kbId}`);

export const fetchKbRecords = (agentId: string, kbId?: string) =>
  http
    .get<{ nodes?: unknown[] }>(`/api/agents/${agentId}/res/nodes${buildKbQuery(kbId)}`)
    .then((res) => ({
      nodes: buildKbTableNodes(res.nodes ?? []),
    }));

export const createKbFolder = (
  agentId: string,
  name: string,
  parentId = "fld_root",
  kbId?: string,
) =>
  http.post<CreateKbFolderResponse>(`/api/agents/${agentId}/res/nodes${buildKbQuery(kbId)}`, {
    name,
    parent_id: parentId,
  });

export const renameKbRecord = (agentId: string, nodeId: string, name: string, kbId?: string) =>
  http.put<RenameKbNodeResponse>(`/api/agents/${agentId}/res/nodes/${nodeId}${buildKbQuery(kbId)}`, {
    name,
  });

export const moveKbRecord = (agentId: string, nodeId: string, parentId: string, kbId?: string) =>
  http.put<MoveKbNodeResponse>(
    `/api/agents/${agentId}/res/nodes/${nodeId}${buildKbQuery(kbId)}`,
    {
      parent_id: parentId,
    },
  );

export const deleteKbRecord = (agentId: string, recordId: string, kbId?: string) =>
  http.delete<DeleteKbRecordResponse>(`/api/agents/${agentId}/res/nodes/${recordId}${buildKbQuery(kbId)}`);

export type RecordContentResponse = {
  record_id: string;
  file_name: string;
  content: string;
  content_type: "parsed" | "source";
};

export const fetchKbRecordContent = (agentId: string, kbId: string, recordId: string) =>
  http.get<RecordContentResponse>(
    `/api/agents/${agentId}/kb/${kbId}/records/${recordId}/content`,
  );
