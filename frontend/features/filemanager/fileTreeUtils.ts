import type { FileNode } from "./types";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function findNode(root: FileNode, id: string): FileNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function flattenNodes(root: FileNode): FileNode[] {
  const out: FileNode[] = [];
  const walk = (node: FileNode) => {
    out.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return out;
}

/** 返回 root → 目标节点的祖先链；未找到时返回空数组 */
export function getNodePath(root: FileNode, id: string): FileNode[] {
  const path: FileNode[] = [];
  const walk = (node: FileNode): boolean => {
    path.push(node);
    if (node.id === id) return true;
    for (const child of node.children ?? []) {
      if (walk(child)) return true;
    }
    path.pop();
    return false;
  };
  walk(root);
  return path;
}
