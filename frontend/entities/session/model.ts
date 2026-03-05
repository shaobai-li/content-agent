export interface Session {
    id: string;
    title: string;
    lastMessageContent?: string;
}

export interface SessionMessage {
  message_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}