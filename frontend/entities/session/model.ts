export interface Session {
    session_id: string;
    title: string;
    content?: string;
}

export interface SessionMessage {
  message_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}