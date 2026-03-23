/**
 * 流式响应读取工具
 * 单一职责：将 fetch Response body 解析为行级 JSON 事件流
 *
 * 后端协议约定：
 *   chunk:           { event: "chunk", data: { content: string } }
 *   done:            { event: "done",  data: { session_id: string, [key: string]: unknown } }
 *   thinking_start:  { event: "thinking_start", data: {} }
 *   thinking_chunk:  { event: "thinking_chunk", data: { content: string } }
 *   thinking_end:    { event: "thinking_end", data: {} }
 *   plan_start:      { event: "plan_start", data: {} }
 *   plan_item:       { event: "plan_item", data: { step: string; index: number } }
 *   plan_end:        { event: "plan_end", data: {} }
 */

export type StreamChunkEvent = {
  event: "chunk";
  data: { content: string };
};

export type StreamDoneEvent = {
  event: "done";
  data: { session_id?: string; [key: string]: unknown };
};

export type ThinkingStartEvent = {
  event: "thinking_start";
  data: Record<string, never>;
};

export type ThinkingChunkEvent = {
  event: "thinking_chunk";
  data: { content: string };
};

export type ThinkingEndEvent = {
  event: "thinking_end";
  data: Record<string, never>;
};

export type PlanStartEvent = {
  event: "plan_start";
  data: Record<string, never>;
};

export type PlanItemEvent = {
  event: "plan_item";
  data: { step: string; index: number };
};

export type PlanEndEvent = {
  event: "plan_end";
  data: Record<string, never>;
};

export type StreamEvent =
  | StreamChunkEvent
  | StreamDoneEvent
  | ThinkingStartEvent
  | ThinkingChunkEvent
  | ThinkingEndEvent
  | PlanStartEvent
  | PlanItemEvent
  | PlanEndEvent;

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
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as StreamEvent;
      } catch {
        // 跳过格式异常的行
      }
    }
  }
}
