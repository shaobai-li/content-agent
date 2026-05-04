import json
import pytest
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
    build_tool_exec_start,
    build_tool_exec_chunk,
    build_tool_exec_end,
    aggregate_stream_to_chat_response,
)


def parse_sse_event(sse_text: str) -> dict:
    """辅助函数：解析单条 SSE 事件为 {event, data} 字典。"""
    block = sse_text.strip()
    if "\n\n" in block:
        block = block.split("\n\n")[0]
    event = ""
    data_str = ""
    for line in block.split("\n"):
        if line.startswith("event: "):
            event = line[7:].strip()
        elif line.startswith("data: "):
            data_str = line[6:].strip()
    return {"event": event, "data": json.loads(data_str)}


class TestBuildStreamChunk:
    def test_event_is_chunk(self):
        obj = parse_sse_event(build_stream_chunk("hello"))
        assert obj["event"] == "chunk"

    def test_data_contains_content(self):
        obj = parse_sse_event(build_stream_chunk("hello"))
        assert obj["data"]["content"] == "hello"

    def test_ends_with_newline(self):
        assert build_stream_chunk("hello").endswith("\n\n")

    def test_empty_content(self):
        obj = parse_sse_event(build_stream_chunk(""))
        assert obj["data"]["content"] == ""

    def test_content_with_special_characters(self):
        obj = parse_sse_event(build_stream_chunk("你好\n世界"))
        assert obj["data"]["content"] == "你好\n世界"


class TestBuildStreamDone:
    def test_event_is_done(self):
        obj = parse_sse_event(build_stream_done("sess-123"))
        assert obj["event"] == "done"

    def test_session_id_in_data(self):
        obj = parse_sse_event(build_stream_done("sess-123"))
        assert obj["data"]["session_id"] == "sess-123"

    def test_ends_with_newline(self):
        assert build_stream_done("sess-123").endswith("\n\n")

    def test_extra_fields_merged_into_data(self):
        obj = parse_sse_event(build_stream_done("sess-123", extra={"foo": "bar"}))
        assert obj["data"]["foo"] == "bar"
        assert obj["data"]["session_id"] == "sess-123"

    def test_no_extra_has_only_session_id(self):
        obj = parse_sse_event(build_stream_done("sess-123"))
        assert list(obj["data"].keys()) == ["session_id"]

    def test_none_extra_ignored(self):
        obj = parse_sse_event(build_stream_done("sess-123", extra=None))
        assert "session_id" in obj["data"]


class TestBuildToolExecStart:
    def test_event_is_tool_exec_start(self):
        obj = parse_sse_event(build_tool_exec_start("read_file", "call_1", {"path": "/tmp/doc.md"}))
        assert obj["event"] == "tool_exec_start"

    def test_name_in_data(self):
        obj = parse_sse_event(build_tool_exec_start("read_file", "call_1", {}))
        assert obj["data"]["name"] == "read_file"

    def test_call_id_in_data(self):
        obj = parse_sse_event(build_tool_exec_start("read_file", "call_1", {}))
        assert obj["data"]["call_id"] == "call_1"

    def test_arguments_in_data(self):
        obj = parse_sse_event(build_tool_exec_start("read_file", "call_1", {"path": "/tmp/doc.md"}))
        assert obj["data"]["arguments"] == {"path": "/tmp/doc.md"}

    def test_ends_with_newline(self):
        assert build_tool_exec_start("read_file", "call_1", {}).endswith("\n\n")


class TestBuildToolExecChunk:
    def test_event_is_tool_exec_chunk(self):
        obj = parse_sse_event(build_tool_exec_chunk("call_1", "partial content"))
        assert obj["event"] == "tool_exec_chunk"

    def test_call_id_in_data(self):
        obj = parse_sse_event(build_tool_exec_chunk("call_1", "hello"))
        assert obj["data"]["call_id"] == "call_1"

    def test_content_in_data(self):
        obj = parse_sse_event(build_tool_exec_chunk("call_1", "hello"))
        assert obj["data"]["content"] == "hello"

    def test_ends_with_newline(self):
        assert build_tool_exec_chunk("call_1", "").endswith("\n\n")


class TestBuildToolExecEnd:
    def test_event_is_tool_exec_end(self):
        obj = parse_sse_event(build_tool_exec_end("call_1"))
        assert obj["event"] == "tool_exec_end"

    def test_call_id_in_data(self):
        obj = parse_sse_event(build_tool_exec_end("call_1"))
        assert obj["data"]["call_id"] == "call_1"

    def test_ends_with_newline(self):
        assert build_tool_exec_end("call_1").endswith("\n\n")


class TestAggregateStreamToChatResponse:
    async def _make_stream(self, lines: list[str]):
        for line in lines:
            yield line

    @pytest.mark.asyncio
    async def test_collects_chunk_content(self):
        stream = self._make_stream([
            build_stream_chunk("hello "),
            build_stream_chunk("world"),
            build_stream_done("sess-1"),
        ])
        result = await aggregate_stream_to_chat_response(stream)
        assert result["reply"] == "hello world"

    @pytest.mark.asyncio
    async def test_session_id_from_done(self):
        stream = self._make_stream([
            build_stream_chunk("hi"),
            build_stream_done("sess-abc"),
        ])
        result = await aggregate_stream_to_chat_response(stream)
        assert result["session_id"] == "sess-abc"

    @pytest.mark.asyncio
    async def test_extra_fields_from_done(self):
        stream = self._make_stream([
            build_stream_done("sess-1", extra={"foo": "bar"}),
        ])
        result = await aggregate_stream_to_chat_response(stream)
        assert result["foo"] == "bar"

    @pytest.mark.asyncio
    async def test_tool_events_not_included_in_reply(self):
        stream = self._make_stream([
            build_tool_exec_start("read_file", "call_1", {}),
            build_tool_exec_chunk("call_1", "file content"),
            build_tool_exec_end("call_1"),
            build_stream_chunk("最终回答"),
            build_stream_done("sess-1"),
        ])
        result = await aggregate_stream_to_chat_response(stream)
        assert result["reply"] == "最终回答"

    @pytest.mark.asyncio
    async def test_no_done_event_uses_empty_session_id(self):
        stream = self._make_stream([
            build_stream_chunk("hi"),
        ])
        result = await aggregate_stream_to_chat_response(stream)
        assert result["session_id"] == ""

    @pytest.mark.asyncio
    async def test_empty_stream(self):
        stream = self._make_stream([])
        result = await aggregate_stream_to_chat_response(stream)
        assert result["reply"] == ""
        assert result["session_id"] == ""
