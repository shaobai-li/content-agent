import json
import pytest
from app.utils.xml_stream_parser import (
    StreamEvent,
    XmlStreamParser,
    create_xml_parser,
    parse_xml_stream,
)


# ── StreamEvent ──────────────────────────────────────────────────────────

def test_stream_event_to_stream_line():
    event = StreamEvent(event="chunk", data={"content": "hello"})
    line = event.to_stream_line()
    parsed = json.loads(line)
    assert parsed == {"event": "chunk", "data": {"content": "hello"}}


def test_stream_event_default_data():
    event = StreamEvent(event="box_end")
    assert event.data == {}


# ── XmlStreamParser: idle → thinking → idle ──────────────────────────────

def test_thinking_tag_full_sequence():
    p = XmlStreamParser()
    p.feed("<thinking>")
    events = p.get_events()
    assert len(events) == 1
    assert events[0].event == "box_start"
    assert events[0].data["title"] == "思考过程"

    p.feed("I need to think about this.")
    events = p.get_events()
    assert len(events) >= 1
    assert any(e.event == "box_chunk" for e in events)

    p.feed("</thinking>")
    events = p.get_events()
    assert any(e.event == "box_end" for e in events)


def test_thinking_tag_with_content_before_end():
    p = XmlStreamParser()
    p.feed("<thinking>hello</thinking>")
    events = p.get_events()
    assert events[0].event == "box_start"
    assert any(e.event == "box_chunk" and e.data["content"] == "hello" for e in events)
    assert events[-1].event == "box_end"


# ── XmlStreamParser: idle → plan → step → plan → idle ────────────────────

def test_plan_with_steps():
    p = XmlStreamParser()
    p.feed("<plan>")
    events = p.get_events()
    assert events[0].event == "box_start"
    assert events[0].data["title"] == "执行计划"

    p.feed("<step>查找相关文件</step>")
    events = p.get_events()
    chunks = [e for e in events if e.event == "box_chunk"]
    assert len(chunks) >= 1
    assert "1." in chunks[0].data["content"]

    p.feed("<step>分析内容</step>")
    events = p.get_events()
    chunks = [e for e in events if e.event == "box_chunk"]
    assert any("2." in c.data["content"] for c in chunks)

    p.feed("</plan>")
    events = p.get_events()
    assert events[-1].event == "box_end"


def test_plan_empty():
    p = XmlStreamParser()
    p.feed("<plan></plan>")
    events = p.get_events()
    box_ends = [e for e in events if e.event == "box_end"]
    assert len(box_ends) >= 1


def test_plan_skips_garbage_between_tags():
    p = XmlStreamParser()
    p.feed("<plan>  \ngarbage\n<step>real</step></plan>")
    events = p.get_events()
    assert events[0].event == "box_start"
    # Should still extract the step
    chunks = [e for e in events if e.event == "box_chunk"]
    assert len(chunks) >= 1
    assert events[-1].event == "box_end"


# ── XmlStreamParser: idle → response → idle ──────────────────────────────

def test_response_full_sequence():
    p = XmlStreamParser()
    p.feed("<response>")
    events = p.get_events()
    assert events[0].event == "response_start"

    p.feed("final answer</response>")
    events = p.get_events()
    chunks = [e for e in events if e.event == "response_chunk"]
    assert len(chunks) >= 1
    assert chunks[0].data["content"] == "final answer"
    assert any(e.event == "response_end" for e in events)


# ── Multiple tags in buffer ──────────────────────────────────────────────

def test_multiple_tags_in_one_feed():
    p = XmlStreamParser()
    p.feed("<thinking>reason</thinking><response>answer</response>")
    events = p.get_events()
    event_names = [e.event for e in events]
    assert "box_start" in event_names
    assert "box_end" in event_names
    assert "response_start" in event_names
    assert "response_end" in event_names


# ── emit_plain_text flag ─────────────────────────────────────────────────

def test_emit_plain_text_default_true():
    p = XmlStreamParser()
    p.feed("plain text before any tag")
    events = p.get_events()
    chunks = [e for e in events if e.event == "chunk"]
    assert len(chunks) >= 1
    assert chunks[0].data["content"] == "plain text before any tag"


def test_emit_plain_text_false():
    p = XmlStreamParser(emit_plain_text=False)
    p.feed("plain text before any tag")
    events = p.get_events()
    assert len(events) == 0  # nothing emitted


# ── Incomplete tag handling ──────────────────────────────────────────────

def test_incomplete_tag_completed_later():
    p = XmlStreamParser()
    p.feed("<think")  # incomplete start
    events1 = p.get_events()
    p.feed("ing>reason</thinking>")  # completed
    events2 = p.get_events()
    all_events = events1 + events2
    assert any(e.event == "box_start" for e in all_events)
    assert any(e.event == "box_end" for e in all_events)


def test_incomplete_end_tag():
    p = XmlStreamParser()
    p.feed("<thinking>content</think")  # incomplete end
    events = p.get_events()
    box_start = [e for e in events if e.event == "box_start"]
    assert len(box_start) == 1
    assert not any(e.event == "box_end" for e in events)


# ── finalize ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("stream", "chunk_event"),
    [
        ("<thinking>unfinished", "box_chunk"),
        ("<response>unfinished", "response_chunk"),
    ],
)
def test_finalize_after_streaming_content(stream, chunk_event):
    # feed() already emits unterminated thinking/response content before finalize.
    p = XmlStreamParser()
    p.feed(stream)
    events_during = p.get_events()
    events_finalize = p.finalize()
    all_events = events_during + events_finalize
    assert any(e.event == chunk_event for e in all_events)
    assert p.state == XmlStreamParser.STATE_IDLE


def test_finalize_plan_without_end_tag():
    p = XmlStreamParser()
    p.feed("<plan><step>unfinished")
    events = p.finalize()
    # Should close the step and then the plan
    has_box_end = any(e.event == "box_end" for e in events)
    assert has_box_end


def test_finalize_step_content():
    p = XmlStreamParser()
    p.feed("<plan><step>content still here")
    events = p.finalize()
    chunks = [e for e in events if e.event == "box_chunk"]
    # Should have the step content
    has_content = any("content still here" in c.data.get("content", "") for c in chunks)
    assert has_content


def test_finalize_idle_state_no_events():
    p = XmlStreamParser()
    events = p.finalize()
    assert events == []


def test_finalize_clears_state_and_is_idempotent():
    p = XmlStreamParser()
    p.feed("<thinking>something")
    p.finalize()
    events = p.finalize()
    assert events == []
    assert p.buffer == ""
    assert p.state == XmlStreamParser.STATE_IDLE


# ── State transitions ────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("stream", "expected_state"),
    [
        ("<thinking>", XmlStreamParser.STATE_THINKING),
        ("<plan>", XmlStreamParser.STATE_PLAN),
        ("<response>", XmlStreamParser.STATE_RESPONSE),
        ("<plan><step>", XmlStreamParser.STATE_STEP),
    ],
)
def test_state_transitions(stream, expected_state):
    p = XmlStreamParser()
    p.feed(stream)
    assert p.state == expected_state


def test_step_reverts_to_plan_after_end():
    p = XmlStreamParser()
    p.feed("<plan><step>content</step>")
    assert p.state == XmlStreamParser.STATE_PLAN


# ── Multiple feeds → get_events clears events ────────────────────────────

def test_get_events_clears_internal_list():
    p = XmlStreamParser()
    p.feed("<thinking>content</thinking>")
    events1 = p.get_events()
    assert len(events1) > 0
    events2 = p.get_events()
    assert len(events2) == 0


# ── Edge cases ───────────────────────────────────────────────────────────

def test_empty_feed():
    p = XmlStreamParser()
    p.feed("")
    events = p.get_events()
    assert events == []


def test_step_numbering_resets_per_plan():
    p = XmlStreamParser()
    p.feed("<plan><step>1</step></plan>")
    p.get_events()
    p.feed("<plan><step>a</step></plan>")
    events = p.get_events()
    chunks = [e for e in events if e.event == "box_chunk"]
    assert any("1." in c.data["content"] for c in chunks)


def test_plan_step_empty_content():
    p = XmlStreamParser()
    p.feed("<plan><step>   </step></plan>")
    events = p.get_events()
    # Empty step still produces a chunk with the step number line
    assert len(events) > 0


def test_xml_entities_in_content():
    p = XmlStreamParser()
    p.feed("<thinking>if a &lt; b &amp;&amp; c &gt; d</thinking>")
    events = p.get_events()
    chunks = [e for e in events if e.event == "box_chunk"]
    assert len(chunks) >= 1
    content = chunks[0].data["content"]
    assert "&lt;" in content


# ── create_xml_parser ────────────────────────────────────────────────────

def test_create_xml_parser_default():
    p = create_xml_parser()
    assert isinstance(p, XmlStreamParser)
    assert p.emit_plain_text is True


def test_create_xml_parser_no_plain_text():
    p = create_xml_parser(emit_plain_text=False)
    assert p.emit_plain_text is False


# ── parse_xml_stream ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_parse_xml_stream_basic():
    async def mock_llm_stream():
        yield "<response>hello</response>"

    events = []
    async for line in parse_xml_stream(mock_llm_stream()):
        events.append(json.loads(line))

    event_names = [e["event"] for e in events]
    assert "response_start" in event_names
    assert "response_end" in event_names
    assert any(e.get("data", {}).get("content") == "hello" for e in events)


@pytest.mark.asyncio
async def test_parse_xml_stream_multiple_chunks():
    async def mock_llm_stream():
        yield "<think"
        yield "ing>"
        yield "reasoning"
        yield "</thinking>"

    events = []
    async for line in parse_xml_stream(mock_llm_stream()):
        events.append(json.loads(line))

    event_names = [e["event"] for e in events]
    assert "box_start" in event_names
    assert "box_end" in event_names
