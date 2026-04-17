export type MessageRole = "user" | "assistant";

/** 可折叠块：与后端 box_start / box_chunk / box_end 一一对应 */
export type MessagePart =
  | { type: "text"; content: string }
  | { type: "box"; title: string; icon?: string; content: string; complete: boolean };

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  type?: "text" | "file";
  parts?: MessagePart[];
}

export type FileStatus = "uploading" | "processing" | "done" | "error";

export interface FileMessage extends Message {
  type: "file";
  fileName: string;
  status: FileStatus;
  progress: number;
}

export function isFileMessage(msg: Message): msg is FileMessage {
  return msg.type === "file";
}
