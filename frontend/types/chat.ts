export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface SessionListItem {
  session_id: string;
  title: string;
  content: string;
}