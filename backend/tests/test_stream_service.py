import json
import pytest
import pytest_asyncio
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
    build_box_start,
    build_box_chunk,
    build_box_end,
    aggregate_stream_to_chat_response,
)


def parse_line(line: str) -> dict:
    """辅助函数：解析单行 JSON 输出"""
    return json.loads(line.strip())


class TestBuildStreamChunk:
    def test_event_is_chunk(self):
        obj = parse_line(build_stream_chunk("hello"))
        assert obj["event"] == "chunk"

    def test_data_contains_content(self):
        obj = parse_line(build_stream_chunk("hello"))
        assert obj["data"]["content"] == "hello"

    def test_ends_with_newline(self):
        assert build_stream_chunk("hello").endswith("\n")

    def test_empty_content(self):
        obj = parse_line(build_stream_chunk(""))
        assert obj["data"]["content"] == ""

    def test_content_with_special_characters(self):
        obj = parse_line(build_stream_chunk("你好\n世界"))
        assert obj["data"]["content"] == "你好\n世界"


class TestBuildStreamDone:
    def test_event_is_done(self):
        obj = parse_line(build_stream_done("sess-123"))
        assert obj["event"] == "done"

    def test_session_id_in_data(self):
        obj = parse_line(build_stream_done("sess-123"))
        assert obj["data"]["session_id"] == "sess-123"

    def test_ends_with_newline(self):
        assert build_stream_done("sess-123").endswith("\n")

    def test_extra_fields_merged_into_data(self):
        obj = parse_line(build_stream_done("sess-123", extra={"foo": "bar"}))
        assert obj["data"]["foo"] == "bar"
        assert obj["data"]["session_id"] == "sess-123"

    def test_no_extra_has_only_session_id(self):
        obj = parse_line(build_stream_done("sess-123"))
        assert list(obj["data"].keys()) == ["session_id"]

    def test_none_extra_ignored(self):
        obj = parse_line(build_stream_done("sess-123", extra=None))
        assert "session_id" in obj["data"]


class TestBuildBoxStart:
    def test_event_is_box_start(self):
        obj = parse_line(build_box_start("思考中"))
        assert obj["event"] == "box_start"

    def test_title_in_data(self):
        obj = parse_line(build_box_start("思考中"))
        assert obj["data"]["title"] == "思考中"

    def test_ends_with_newline(self):
        assert build_box_start("思考中").endswith("\n")

    def test_icon_included_when_provided(self):
        obj = parse_line(build_box_start("思考中", icon="🔍"))
        assert obj["data"]["icon"] == "🔍"

    def test_icon_omitted_when_not_provided(self):
        obj = parse_line(build_box_start("思考中"))
        assert "icon" not in obj["data"]

    def test_icon_omitted_when_none(self):
        obj = parse_line(build_box_start("思考中", icon=None))
        assert "icon" not in obj["data"]


class TestBuildBoxChunk:
    def test_event_is_box_chunk(self):
        obj = parse_line(build_box_chunk("中间内容"))
        assert obj["event"] == "box_chunk"

    def test_data_contains_content(self):
        obj = parse_line(build_box_chunk("中间内容"))
        assert obj["data"]["content"] == "中间内容"

    def test_ends_with_newline(self):
        assert build_box_chunk("中间内容").endswith("\n")


class TestBuildBoxEnd:
    def test_event_is_box_end(self):
        obj = parse_line(build_box_end())
        assert obj["event"] == "box_end"

    def test_data_is_empty_dict(self):
        obj = parse_line(build_box_end())
        assert obj["data"] == {}

    def test_ends_with_newline(self):
        assert build_box_end().endswith("\n")


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
    async def test_box_events_not_included_in_reply(self):
        stream = self._make_stream([
            build_box_start("thinking"),
            build_box_chunk("内部推理内容"),
            build_box_end(),
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
