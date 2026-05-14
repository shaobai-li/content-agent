import json
from unittest.mock import patch
import pytest
from app.runtime.agent_turn_context import (
    _parse_attachment_paths_json,
    build_agent_turn_context,
    AgentTurnContext,
)


# ── _parse_attachment_paths_json ────────────────────────────────────────────

@pytest.mark.parametrize("raw", [None, "", "   "])
def test_parse_attachment_paths_empty(raw):
    assert _parse_attachment_paths_json(raw) == []


def test_parse_attachment_paths_valid_list():
    result = _parse_attachment_paths_json('["/tmp/a.pdf", "/tmp/b.pdf"]')
    assert result == ["/tmp/a.pdf", "/tmp/b.pdf"]


def test_parse_attachment_paths_non_string_elements_filtered():
    result = _parse_attachment_paths_json('["/tmp/a.pdf", 42, "/tmp/b.pdf"]')
    assert result == ["/tmp/a.pdf", "/tmp/b.pdf"]


def test_parse_attachment_paths_invalid_json():
    assert _parse_attachment_paths_json("not json") == []


def test_parse_attachment_paths_non_list_json():
    assert _parse_attachment_paths_json('{"key": "val"}') == []


# ── build_agent_turn_context ────────────────────────────────────────────────

def test_build_context_basic():
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=[]) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages", return_value=[]) as mock_load:
        ctx = build_agent_turn_context("test_agent", text="hello")
        assert ctx.agent_id == "test_agent"
        assert ctx.session_id is None
        assert ctx.history_messages == []
        assert "hello" in ctx.user_text


def test_build_context_with_mentions():
    mentions = [{"name": "doc1"}]
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=mentions) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages", return_value=[]):
        ctx = build_agent_turn_context("ag", text="query", mentions='[{"name":"doc1"}]')
        assert ctx.mentions == mentions


def test_build_context_with_attachments():
    paths = ["/fake/cache/a.pdf"]
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=[]) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[__import__("pathlib").Path(p) for p in paths]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages", return_value=[]):
        ctx = build_agent_turn_context("ag", text="hi", attachment_paths='["/fake/cache/a.pdf"]')
        assert len(ctx.resolved_attachment_paths) == 1


def test_build_context_with_session_loads_history():
    history = [{"role": "user", "content": "past"}]
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=[]) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages", return_value=history) as mock_load:
        ctx = build_agent_turn_context("ag", text="hi", session_id="s1")
        mock_load.assert_called_once_with("ag", "s1")
        assert ctx.history_messages == history


def test_build_context_no_session_skips_history():
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=[]) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages") as mock_load:
        build_agent_turn_context("ag", text="hi")
        mock_load.assert_not_called()


def test_build_context_empty_text():
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=[]) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages", return_value=[]):
        ctx = build_agent_turn_context("ag")
        assert ctx.user_text == ""


def test_build_context_passes_raw_attachments_through():
    from unittest.mock import MagicMock
    att = [MagicMock()]
    with patch("app.runtime.agent_turn_context.parse_mentions", return_value=[]) as mock_parse, \
         patch("app.runtime.agent_turn_context.resolve_validated_cache_paths", return_value=[]) as mock_resolve, \
         patch("app.runtime.agent_turn_context.load_messages", return_value=[]):
        ctx = build_agent_turn_context("ag", text="hi", attachments=att)
        assert ctx.attachments is att
