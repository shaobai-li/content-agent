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

/** 按文件名过滤目录树（大小写不敏感、模糊匹配）。保留命中节点及其祖先链；文件夹名命中时保留其整棵子树。 */
export function filterTree(root: FileNode, keyword: string): FileNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [root];
  const match = (node: FileNode) => node.name.toLowerCase().includes(kw);
  const filter = (node: FileNode): FileNode | null => {
    if (node.type === "file") return match(node) ? node : null;
    if (match(node)) return { ...node }; // 文件夹名命中 → 保留整棵子树（浅克隆，结果树不与源节点共享）
    const children = (node.children ?? [])
      .map(filter)
      .filter((c): c is FileNode => c !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  };
  const top = filter(root);
  return top ? [top] : [];
}

const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "text", "json", "yaml", "yml", "toml",
  "py", "ts", "tsx", "js", "jsx", "rs", "go", "java", "c", "cpp", "h",
  "sh", "bash", "ps1", "css", "scss", "html", "xml", "csv", "ini", "cfg", "log",
]);

/** 是否文本文件（可在 filemanager 内编辑） */
export function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name));
}
