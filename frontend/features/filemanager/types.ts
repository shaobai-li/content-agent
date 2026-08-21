export type FileNodeType = "folder" | "file";

export interface FileNode {
  id: string;
  name: string;
  type: FileNodeType;
  /** 仅 folder：子节点 */
  children?: FileNode[];
  /** 仅 file：字节大小 */
  size?: number;
  /** 修改时间 ISO 字符串 */
  modifiedAt?: string;
  /** 仅 file：纯文本预览内容 */
  content?: string;
  /** 后端真实文件的相对路径（用于内容读取） */
  path?: string;
}
