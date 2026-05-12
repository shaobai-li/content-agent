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


# ── build_stream_chunk ───────────────────────────────────────────────────

@pytest.mark.parametrize("content", ["hello", ""])
def test_build_stream_chunk_format(content):
    result = build_stream_chunk(content)
    assert result.startswith("event: chunk\n")
    assert "data: " in result
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed == {"content": content}


# ── build_stream_done ────────────────────────────────────────────────────

def test_build_stream_done_format():
    result = build_stream_done("sess-1")
    assert result.startswith("event: done\n")
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed == {"session_id": "sess-1"}


def test_build_stream_done_with_extra():
    result = build_stream_done("sess-1", {"tokens": 42})
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed == {"session_id": "sess-1", "tokens": 42}


def test_build_stream_done_extra_overwrites_session():
    result = build_stream_done("sess-1", {"session_id": "overridden"})
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed["session_id"] == "overridden"


# ── build_tool_exec_start ────────────────────────────────────────────────

def test_build_tool_exec_start_format():
    result = build_tool_exec_start("my_tool", "call-1", {"key": "val"})
    assert result.startswith("event: tool_exec_start\n")
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed == {"name": "my_tool", "call_id": "call-1", "arguments": {"key": "val"}}


# ── build_tool_exec_chunk ────────────────────────────────────────────────

def test_build_tool_exec_chunk_format():
    result = build_tool_exec_chunk("call-1", "partial output")
    assert result.startswith("event: tool_exec_chunk\n")
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed == {"call_id": "call-1", "content": "partial output"}


# ── build_tool_exec_end ──────────────────────────────────────────────────

def test_build_tool_exec_end_format():
    result = build_tool_exec_end("call-1")
    assert result.startswith("event: tool_exec_end\n")
    parsed = json.loads(result.split("data: ")[1].strip())
    assert parsed == {"call_id": "call-1"}


# ── aggregate_stream_to_chat_response ────────────────────────────────────

@pytest.mark.asyncio
async def test_aggregate_empty_stream():
    async def empty():
        for _ in range(0):
            yield
    result = await aggregate_stream_to_chat_response(empty())
    assert result == {"reply": "", "session_id": ""}


@pytest.mark.asyncio
async def test_aggregate_multiple_chunks():
    async def stream():
        yield build_stream_chunk("hello ")
        yield build_stream_chunk("world")

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "hello world"


@pytest.mark.asyncio
async def test_aggregate_chunk_and_done():
    async def stream():
        yield build_stream_chunk("reply text")
        yield build_stream_done("sess-42", {"tokens": 100})

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "reply text"
    assert result["session_id"] == "sess-42"
    assert result["tokens"] == 100


@pytest.mark.asyncio
async def test_aggregate_done_without_chunk():
    async def stream():
        yield build_stream_done("sess-1")

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == ""
    assert result["session_id"] == "sess-1"


@pytest.mark.asyncio
async def test_aggregate_error_events_ignored():
    async def stream():
        yield "event: error\ndata: {\"msg\":\"fail\"}\n\n"
        yield build_stream_chunk("ok")

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "ok"


@pytest.mark.asyncio
async def test_aggregate_invalid_json_silently_skipped():
    async def stream():
        yield "event: chunk\ndata: not-json\n\n"
        yield build_stream_chunk("valid")

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "valid"


@pytest.mark.asyncio
async def test_aggregate_empty_block_between_events():
    async def stream():
        yield build_stream_chunk("hello")
        yield "\n\n"
        yield build_stream_chunk("world")

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "helloworld"


@pytest.mark.asyncio
async def test_aggregate_block_without_data():
    async def stream():
        yield "event: chunk\n\n"
        yield build_stream_chunk("ok")

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "ok"


@pytest.mark.asyncio
async def test_aggregate_response_chunk_events():
    async def stream():
        yield build_stream_chunk("chunk1 ")
        yield f"event: response_chunk\ndata: {json.dumps({'content': 'chunk2'})}\n\n"

    result = await aggregate_stream_to_chat_response(stream())
    assert result["reply"] == "chunk1 chunk2"
