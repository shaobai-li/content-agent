/**
 * 流式响应读取工具
 * 单一职责：将 fetch Response body 解析为 SSE 事件流
 *
 * 后端协议约定（SSE 格式）：
 *   event: chunk
 *   data: {"content": "..."}
 *
 *   event: done
 *   data: {"session_id": "...", ...}
 *
 *   event: tool_exec_start
 *   data: {"name": "...", "call_id": "...", "hint": "..."}
 *
 *   event: tool_exec_end
 *   data: {"call_id": "..."}
 */

export type StreamChunkEvent = {
  event: "chunk";
  data: { content: string };
};

export type StreamDoneEvent = {
  event: "done";
  data: { session_id?: string; [key: string]: unknown };
};

export type ToolExecStartEvent = {
  event: "tool_exec_start";
  data: { name: string; call_id: string; hint: string };
};

export type ToolExecEndEvent = {
  event: "tool_exec_end";
  data: { call_id: string; status: "ok" | "error"; error?: string };
};

export type StreamCanvasCardEvent = {
  event: "canvas_card";
  data: { content: string; type: string; title?: string };
};

export type StreamEvent =
  | StreamChunkEvent
  | StreamDoneEvent
  | ToolExecStartEvent
  | ToolExecEndEvent
  | StreamCanvasCardEvent;

export async function* readStreamLines(
  response: Response
): AsyncGenerator<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE delimiter: double newline
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsed = parseSSEBlock(block);
      if (parsed) yield parsed;
    }
  }
}

function parseSSEBlock(block: string): StreamEvent | null {
  const lines = block.split("\n");
  let eventType = "";
  let dataStr = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("event: ")) {
      eventType = trimmed.slice(7);
    } else if (trimmed.startsWith("data: ")) {
      dataStr = trimmed.slice(6);
    }
  }

  if (!eventType || !dataStr) return null;

  try {
    return JSON.parse(
      `{"event":${JSON.stringify(eventType)},"data":${dataStr}}`
    ) as StreamEvent;
  } catch {
    return null;
  }
}
