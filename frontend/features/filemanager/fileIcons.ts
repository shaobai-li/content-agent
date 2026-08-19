import {
  File,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import type { FileNode } from "./types";
import { getExtension } from "./fileTreeUtils";

const FILE_ICONS: Record<string, LucideIcon> = {
  md: FileText,
  txt: FileText,
  py: FileCode,
  ts: FileCode,
  js: FileCode,
  rs: FileCode,
  json: FileJson,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
};

export function getFileIcon(node: FileNode, expanded: boolean): LucideIcon {
  if (node.type === "folder") return expanded ? FolderOpen : Folder;
  return FILE_ICONS[getExtension(node.name)] ?? File;
}
