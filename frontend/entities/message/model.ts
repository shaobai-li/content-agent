export type MessageRole = "user" | "assistant";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string; complete: boolean }
  | { type: "plan"; steps: string[]; complete: boolean };

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