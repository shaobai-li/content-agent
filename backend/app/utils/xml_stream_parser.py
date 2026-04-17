"""
XML 流式解析器

用于解析 LLM 输出的结构化 XML 格式，并转换为流式事件。

支持的 XML 格式：
<thinking>
思考内容...
</thinking>
<plan>
<step>步骤1</step>
<step>步骤2</step>
</plan>
<response>
最终回复内容...
</response>

输出事件类型：
- box_start / box_chunk / box_end（思考、计划等均用 title + 正文块）
- response_start/response_chunk/response_end

使用示例：
    parser = XmlStreamParser()
    for chunk in llm_stream:
        parser.feed(chunk)
        for event in parser.get_events():
            yield event.to_stream_line()
    # 流结束，处理剩余内容
    for event in parser.finalize():
        yield event.to_stream_line()
"""

import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class StreamEvent:
    """流式事件"""
    event: str
    data: Dict[str, Any] = field(default_factory=dict)

    def to_stream_line(self) -> str:
        """转换为流式输出行的 JSON 格式"""
        return json.dumps({"event": self.event, "data": self.data}) + "\n"


class XmlStreamParser:
    """
    XML 流式解析器

    使用状态机模式追踪当前解析状态，处理流式输入的 XML 内容。
    支持标签被截断、格式错误等边界情况。
    """

    # 解析状态
    STATE_IDLE = "idle"              # 初始状态，等待标签
    STATE_THINKING = "thinking"      # 在 thinking 标签内
    STATE_PLAN = "plan"              # 在 plan 标签内
    STATE_STEP = "step"              # 在 step 标签内
    STATE_RESPONSE = "response"      # 在 response 标签内

    # 标签定义
    TAG_THINKING_START = "<thinking>"
    TAG_THINKING_END = "</thinking>"
    TAG_PLAN_START = "<plan>"
    TAG_PLAN_END = "</plan>"
    TAG_STEP_START = "<step>"
    TAG_STEP_END = "</step>"
    TAG_RESPONSE_START = "<response>"
    TAG_RESPONSE_END = "</response>"

    def __init__(self, emit_plain_text: bool = True):
        self.state = self.STATE_IDLE
        self.buffer = ""               # 未处理的缓冲区
        self.events: List[StreamEvent] = []  # 解析出的事件
        self.plan_step_index = 0       # 当前 plan step 的序号
        self.incomplete_tag_buffer = ""  # 可能不完整的标签缓冲区
        self.emit_plain_text = emit_plain_text  # 无标签时是否输出普通 chunk

    def feed(self, chunk: str) -> None:
        """
        接收 LLM 输出的 chunk，进行解析

        Args:
            chunk: LLM 输出的文本片段
        """
        # 将新内容添加到缓冲区
        self.buffer += chunk

        # 处理缓冲区内容
        self._process_buffer()

    def get_events(self) -> List[StreamEvent]:
        """
        获取并清空当前解析出的事件列表

        Returns:
            解析出的事件列表
        """
        events = self.events
        self.events = []
        return events

    def _process_buffer(self) -> None:
        """处理缓冲区内容，根据当前状态进行解析"""
        while self.buffer:
            if self.state == self.STATE_IDLE:
                if not self._process_idle_state():
                    break
            elif self.state == self.STATE_THINKING:
                if not self._process_thinking_state():
                    break
            elif self.state == self.STATE_PLAN:
                if not self._process_plan_state():
                    break
            elif self.state == self.STATE_STEP:
                if not self._process_step_state():
                    break
            elif self.state == self.STATE_RESPONSE:
                if not self._process_response_state():
                    break
            else:
                # 未知状态，清空缓冲区防止死循环
                self.buffer = ""
                break

    def _process_idle_state(self) -> bool:
        """
        处理 IDLE 状态：寻找开始标签

        Returns:
            是否继续处理
        """
        # 寻找任意开始标签
        thinking_pos = self.buffer.find(self.TAG_THINKING_START)
        plan_pos = self.buffer.find(self.TAG_PLAN_START)
        response_pos = self.buffer.find(self.TAG_RESPONSE_START)

        # 找到最先出现的标签
        positions = []
        if thinking_pos != -1:
            positions.append((thinking_pos, self.TAG_THINKING_START, self.STATE_THINKING))
        if plan_pos != -1:
            positions.append((plan_pos, self.TAG_PLAN_START, self.STATE_PLAN))
        if response_pos != -1:
            positions.append((response_pos, self.TAG_RESPONSE_START, self.STATE_RESPONSE))

        if not positions:
            # 没有完整的开始标签
            if self.emit_plain_text and self.buffer:
                # 输出普通 chunk（保留可能的不完整标签）
                content = self._extract_content_preserving_tags()
                if content:
                    self.events.append(StreamEvent(
                        event="chunk",
                        data={"content": content}
                    ))
            else:
                # 保留最后几个字符（可能是不完整标签）
                self._preserve_incomplete_tag()
            return False

        # 按位置排序，取第一个
        positions.sort(key=lambda x: x[0])
        pos, tag, new_state = positions[0]

        # 如果标签前有内容，作为普通文本输出（如果启用了 emit_plain_text）
        if pos > 0:
            if self.emit_plain_text:
                plain_content = self.buffer[:pos]
                if plain_content:
                    self.events.append(StreamEvent(
                        event="chunk",
                        data={"content": plain_content}
                    ))
            self.buffer = self.buffer[pos:]

        # 切换到新状态
        self._enter_state(new_state)
        return True

    def _process_thinking_state(self) -> bool:
        """
        处理 THINKING 状态：收集思考内容直到遇到结束标签

        Returns:
            是否继续处理
        """
        end_pos = self.buffer.find(self.TAG_THINKING_END)

        if end_pos == -1:
            # 没有找到结束标签，输出所有内容为 chunk（保留可能的不完整标签）
            content = self._extract_content_preserving_tags()
            if content:
                self.events.append(
                    StreamEvent(
                        event="box_chunk",
                        data={"content": content},
                    )
                )
            return False

        # 找到结束标签，输出到结束标签前的内容
        content = self.buffer[:end_pos]
        if content:
            self.events.append(StreamEvent(
                event="box_chunk",
                data={"content": content}
            ))

        # 发送 box_end 事件
        self.events.append(StreamEvent(event="box_end", data={}))

        # 切换状态
        self.buffer = self.buffer[end_pos + len(self.TAG_THINKING_END):]
        self.state = self.STATE_IDLE
        return True

    def _process_plan_state(self) -> bool:
        """
        处理 PLAN 状态：等待 step 标签或结束标签

        Returns:
            是否继续处理
        """
        # 跳过空白字符
        self.buffer = self.buffer.lstrip()

        if not self.buffer:
            return False

        # 检查是否是 plan 结束标签
        if self.buffer.startswith(self.TAG_PLAN_END):
            self.events.append(StreamEvent(event="box_end", data={}))
            self.buffer = self.buffer[len(self.TAG_PLAN_END):]
            self.state = self.STATE_IDLE
            return True

        # 检查是否是 step 开始标签
        if self.buffer.startswith(self.TAG_STEP_START):
            self.state = self.STATE_STEP
            self.plan_step_index += 1
            self.buffer = self.buffer[len(self.TAG_STEP_START):]
            return True

        # 可能是格式错误或不完整，尝试查找下一个标签
        next_tag_pos = self._find_next_tag_position()
        if next_tag_pos == -1:
            # 保留可能的不完整标签
            self._preserve_incomplete_tag()
            return False

        # 丢弃错误内容，继续处理
        if next_tag_pos > 0:
            self.buffer = self.buffer[next_tag_pos:]
            return True

        # 无法处理，跳过字符防止死循环
        self.buffer = self.buffer[1:]
        return True

    def _process_step_state(self) -> bool:
        """
        处理 STEP 状态：收集步骤内容直到遇到结束标签

        Returns:
            是否继续处理
        """
        end_pos = self.buffer.find(self.TAG_STEP_END)

        if end_pos == -1:
            # 没有找到结束标签，等待更多内容
            # 不输出部分内容，避免重复
            return False

        # 找到结束标签
        content = self.buffer[:end_pos].strip()
        line = f"{self.plan_step_index}. {content}\n"
        self.events.append(StreamEvent(event="box_chunk", data={"content": line}))

        # 返回 plan 状态继续处理其他 step
        self.buffer = self.buffer[end_pos + len(self.TAG_STEP_END):]
        self.state = self.STATE_PLAN
        return True

    def _process_response_state(self) -> bool:
        """
        处理 RESPONSE 状态：收集响应内容直到遇到结束标签

        Returns:
            是否继续处理
        """
        end_pos = self.buffer.find(self.TAG_RESPONSE_END)

        if end_pos == -1:
            # 没有找到结束标签，输出所有内容为 chunk（保留可能的不完整标签）
            content = self._extract_content_preserving_tags()
            if content:
                self.events.append(StreamEvent(
                    event="response_chunk",
                    data={"content": content}
                ))
            return False

        # 找到结束标签，输出到结束标签前的内容
        content = self.buffer[:end_pos]
        if content:
            self.events.append(StreamEvent(
                event="response_chunk",
                data={"content": content}
            ))

        # 发送 response_end 事件
        self.events.append(StreamEvent(event="response_end", data={}))

        # 切换状态
        self.buffer = self.buffer[end_pos + len(self.TAG_RESPONSE_END):]
        self.state = self.STATE_IDLE
        return True

    def _enter_state(self, new_state: str) -> None:
        """进入新状态，发送相应事件"""
        if new_state == self.STATE_THINKING:
            self.events.append(StreamEvent(event="box_start", data={"title": "思考过程"}))
            self.buffer = self.buffer[len(self.TAG_THINKING_START):]
        elif new_state == self.STATE_PLAN:
            self.events.append(StreamEvent(event="box_start", data={"title": "执行计划"}))
            self.plan_step_index = 0
            self.buffer = self.buffer[len(self.TAG_PLAN_START):]
        elif new_state == self.STATE_RESPONSE:
            self.events.append(StreamEvent(event="response_start", data={}))
            self.buffer = self.buffer[len(self.TAG_RESPONSE_START):]

        self.state = new_state

    def _extract_content_preserving_tags(self) -> str:
        """
        提取内容，但保留可能的不完整标签（包括开始标签和结束标签）

        Returns:
            可以安全输出的内容
        """
        # 检查是否是潜在的不完整标签（包括开始标签和结束标签）
        all_tags = [
            self.TAG_THINKING_START, self.TAG_THINKING_END,
            self.TAG_PLAN_START, self.TAG_PLAN_END,
            self.TAG_STEP_START, self.TAG_STEP_END,
            self.TAG_RESPONSE_START, self.TAG_RESPONSE_END,
        ]
        
        for tag in all_tags:
            if self._is_potential_incomplete_tag(tag):
                # 保留可能包含不完整标签的内容
                safe_length = len(self.buffer) - len(tag) + 1
                if safe_length > 0:
                    content = self.buffer[:safe_length]
                    self.buffer = self.buffer[safe_length:]
                    return content
                return ""

        # 没有潜在的不完整标签，输出所有内容
        content = self.buffer
        self.buffer = ""
        return content

    def _is_potential_incomplete_tag(self, tag: str) -> bool:
        """
        检查缓冲区末尾是否可能是指定标签的一部分

        Args:
            tag: 要检查的标签

        Returns:
            是否可能是不完整标签
        """
        # 检查缓冲区的后缀是否匹配标签的前缀
        buffer_len = len(self.buffer)
        tag_len = len(tag)

        for i in range(1, min(tag_len, buffer_len) + 1):
            if self.buffer[-i:] == tag[:i]:
                return True
        return False

    def _preserve_incomplete_tag(self) -> None:
        """
        保留可能不完整的标签在缓冲区，丢弃已确认安全的内容
        """
        max_tag_len = max(
            len(self.TAG_THINKING_START),
            len(self.TAG_THINKING_END),
            len(self.TAG_PLAN_START),
            len(self.TAG_PLAN_END),
            len(self.TAG_STEP_START),
            len(self.TAG_STEP_END),
            len(self.TAG_RESPONSE_START),
            len(self.TAG_RESPONSE_END)
        )

        if len(self.buffer) > max_tag_len:
            # 保留最后 max_tag_len 个字符作为可能的标签
            safe_content = self.buffer[:-max_tag_len]
            self.buffer = self.buffer[-max_tag_len:]

            # 如果安全内容不为空，可能需要处理它
            # 目前只是丢弃，因为无法识别
            # 可以考虑在这里添加警告日志

    def _find_next_tag_position(self) -> int:
        """
        查找下一个标签的位置

        Returns:
            下一个标签的位置，如果没有则返回 -1
        """
        tags = [
            self.TAG_THINKING_START, self.TAG_THINKING_END,
            self.TAG_PLAN_START, self.TAG_PLAN_END,
            self.TAG_STEP_START, self.TAG_STEP_END,
            self.TAG_RESPONSE_START, self.TAG_RESPONSE_END
        ]

        positions = [pos for pos in [self.buffer.find(tag) for tag in tags] if pos != -1]
        return min(positions) if positions else -1

    def finalize(self) -> List[StreamEvent]:
        """
        完成解析，处理缓冲区中剩余的内容

        用于流结束时，强制输出所有剩余内容

        Returns:
            剩余的事件列表
        """
        # 根据当前状态处理剩余内容
        if self.state == self.STATE_THINKING and self.buffer:
            self.events.append(StreamEvent(
                event="box_chunk",
                data={"content": self.buffer}
            ))
            self.events.append(StreamEvent(event="box_end", data={}))
        elif self.state == self.STATE_STEP and self.buffer:
            content = self.buffer.strip()
            if content:
                line = f"{self.plan_step_index}. {content}\n"
                self.events.append(StreamEvent(event="box_chunk", data={"content": line}))
            self.events.append(StreamEvent(event="box_end", data={}))
        elif self.state == self.STATE_PLAN:
            self.events.append(StreamEvent(event="box_end", data={}))
        elif self.state == self.STATE_RESPONSE and self.buffer:
            self.events.append(StreamEvent(
                event="response_chunk",
                data={"content": self.buffer}
            ))
            self.events.append(StreamEvent(event="response_end", data={}))

        self.buffer = ""
        self.state = self.STATE_IDLE

        events = self.events
        self.events = []
        return events


# 便利函数，用于直接转换事件为 stream_service 格式

def create_xml_parser(emit_plain_text: bool = True) -> XmlStreamParser:
    """创建新的 XML 流式解析器实例"""
    return XmlStreamParser(emit_plain_text=emit_plain_text)


async def parse_xml_stream(llm_stream) -> str:
    """
    辅助函数：将 XML 格式的 LLM 流转换为行级 JSON 事件流

    Args:
        llm_stream: 异步生成器，产生 LLM 输出的文本片段

    Yields:
        JSON 格式的流式事件行

    使用示例：
        async for line in parse_xml_stream(deepseek_chat_stream(messages)):
            yield line
    """
    parser = create_xml_parser()
    async for chunk in llm_stream:
        parser.feed(chunk)
        for event in parser.get_events():
            yield event.to_stream_line()
    # 流结束，处理剩余内容
    for event in parser.finalize():
        yield event.to_stream_line()
