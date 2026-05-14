import json
from pathlib import Path
from unittest.mock import patch, mock_open
import pytest
from app.agents.standard.tools import (
    _strip_tags,
    _normalize,
    _validate_url,
    _decode_duckduckgo_href,
    _format_results,
    _safe_int,
    _resolve_under_workspace,
    STANDARD_AGENT_TOOLS,
    make_tool_executor,
)


# ── _strip_tags ─────────────────────────────────────────────────────────────

def test_strip_tags_removes_html():
    assert _strip_tags("<p>hello</p>") == "hello"


def test_strip_tags_removes_script_and_style():
    text = '<script>evil()</script><style>.x{}</style><p>content</p>'
    result = _strip_tags(text)
    assert "evil" not in result.lower()
    assert ".x" not in result
    assert "content" in result


def test_strip_tags_empty_returns_empty():
    assert _strip_tags("") == ""


# ── _normalize ──────────────────────────────────────────────────────────────

def test_normalize_collapses_spaces():
    assert _normalize("hello   world") == "hello world"


def test_normalize_collapses_newlines():
    assert _normalize("a\n\n\n\nb") == "a\n\nb"


def test_normalize_strips():
    assert _normalize("  hi  ") == "hi"


# ── _validate_url ───────────────────────────────────────────────────────────

def test_validate_url_http():
    valid, msg = _validate_url("http://example.com")
    assert valid is True


def test_validate_url_https():
    valid, msg = _validate_url("https://example.com/path?q=1")
    assert valid is True


def test_validate_url_rejects_ftp():
    valid, msg = _validate_url("ftp://example.com")
    assert valid is False


def test_validate_url_rejects_missing_domain():
    valid, msg = _validate_url("http://")
    assert valid is False


# ── _decode_duckduckgo_href ────────────────────────────────────────────────

def test_decode_ddg_redirect():
    href = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com"
    assert _decode_duckduckgo_href(href) == "https://example.com"


def test_decode_ddg_non_redirect_passthrough():
    href = "https://example.com/page"
    assert _decode_duckduckgo_href(href) == href


def test_decode_ddg_empty():
    assert _decode_duckduckgo_href("") == ""


def test_decode_ddg_non_ddg_domain():
    href = "https://google.com/l/?uddg=foo"
    assert _decode_duckduckgo_href(href) == href


# ── _format_results ─────────────────────────────────────────────────────────

def test_format_results_empty():
    result = _format_results("test query", [], 5)
    assert result == "No results for: test query"


def test_format_results_basic():
    items = [{"title": "T1", "url": "http://a.com", "content": "snippet1"}]
    result = _format_results("q", items, 5)
    assert "Results for: q" in result
    assert "1. T1" in result
    assert "http://a.com" in result
    assert "snippet1" in result


def test_format_results_limits_count():
    items = [
        {"title": f"T{i}", "url": f"http://{i}.com", "content": ""}
        for i in range(10)
    ]
    result = _format_results("q", items, 3)
    assert "1." in result and "2." in result and "3." in result
    assert "4." not in result


# ── _safe_int ───────────────────────────────────────────────────────────────

def test_safe_int_valid():
    assert _safe_int("42", 10) == 42


def test_safe_int_invalid_returns_default():
    assert _safe_int("not a number", 10) == 10


def test_safe_int_none_returns_default():
    assert _safe_int(None, 10) == 10


# ── _resolve_under_workspace ────────────────────────────────────────────────

def test_resolve_under_workspace_valid(tmp_path):
    result = _resolve_under_workspace(tmp_path, "subdir/file.txt")
    assert result == (tmp_path / "subdir" / "file.txt").resolve()


def test_resolve_under_workspace_outside_raises(tmp_path):
    with pytest.raises(ValueError, match="outside workspace"):
        _resolve_under_workspace(tmp_path, "../outside/file.txt")


# ── STANDARD_AGENT_TOOLS ────────────────────────────────────────────────────

def test_standard_agent_tools_structure():
    assert isinstance(STANDARD_AGENT_TOOLS, list)
    tool_names = set()
    for tool in STANDARD_AGENT_TOOLS:
        assert tool["type"] == "function"
        func = tool["function"]
        assert "name" in func
        assert "description" in func
        assert "parameters" in func
        assert "type" in func["parameters"]
        assert "properties" in func["parameters"]
        tool_names.add(func["name"])
    assert tool_names == {"run_command", "read_file", "write_file", "web_search", "web_fetch", "invoke_skill"}


# ── make_tool_executor ──────────────────────────────────────────────────────

def test_make_executor_read_file(tmp_path):
    file_path = tmp_path / "test.txt"
    file_path.write_text("hello world")
    executor = make_tool_executor(tmp_path, "agent1")
    result = executor("read_file", json.dumps({"path": "test.txt"}))
    assert result == "hello world"


def test_make_executor_read_file_not_exists(tmp_path):
    executor = make_tool_executor(tmp_path, "agent1")
    result = executor("read_file", json.dumps({"path": "nonexistent.txt"}))
    assert "does not exist" in result


def test_make_executor_write_file(tmp_path):
    executor = make_tool_executor(tmp_path, "agent1")
    result = executor("write_file", json.dumps({"path": "out.txt", "content": "data"}))
    assert "Successfully" in result
    assert (tmp_path / "out.txt").read_text() == "data"


def test_make_executor_unknown_tool(tmp_path):
    executor = make_tool_executor(tmp_path, "agent1")
    result = executor("unknown_tool", json.dumps({}))
    assert "unknown tool" in result


def test_make_executor_invalid_json(tmp_path):
    executor = make_tool_executor(tmp_path, "agent1")
    result = executor("read_file", "not json")
    assert "invalid tool arguments JSON" in result
