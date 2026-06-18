export interface Session {
    session_id: string;
    title: string;
    content?: string;
}

export interface SessionMessage {
  message_id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  created_at: string;
  tool_calls?: Array<{
    id: string;
    type?: string;
    function: { name: string; arguments: string };
    /** 后端生成的简洁工具调用提示，如 "run_command (python script.py)" */
    hint?: string;
  }>;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}