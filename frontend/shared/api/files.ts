/**
 * Agent workspace 文件 API（目录树 + 内容读取）
 */

import { http } from "./http";

export type FileTreeNode = {
  id: string;
  name: string;
  type: "folder" | "file";
  path: string;
  size?: number;
  modifiedAt?: string;
  children?: FileTreeNode[];
};

export async function fetchFileTree(agentId: string): Promise<FileTreeNode> {
  const res = await http.get<{ tree: FileTreeNode }>(`/api/agents/${agentId}/files/tree`);
  return res.tree;
}

export async function fetchFileContent(agentId: string, path: string): Promise<string> {
  const res = await http.get<{ path: string; content: string }>(
    `/api/agents/${agentId}/files/content?path=${encodeURIComponent(path)}`,
  );
  return res.content;
}

export async function updateFileContent(agentId: string, path: string, content: string): Promise<void> {
  await http.put(`/api/agents/${agentId}/files/content?path=${encodeURIComponent(path)}`, { content });
}
