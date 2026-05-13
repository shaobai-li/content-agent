from unittest.mock import patch
import pytest
from app.utils.llm_client import (
    _log_system_prompt_sent_to_llm,
    _log_last_user_message_sent_to_llm,
    _assistant_message_from_stream_parts,
)


# ── _log_system_prompt_sent_to_llm ─────────────────────────────────────────

def test_log_system_empty_messages_noop():
    with patch("app.utils.llm_client.logger.debug") as mock_debug:
        _log_system_prompt_sent_to_llm([])
        mock_debug.assert_not_called()


def test_log_system_no_system_role_noop():
    with patch("app.utils.llm_client.logger.debug") as mock_debug:
        _log_system_prompt_sent_to_llm([{"role": "user", "content": "hi"}])
        mock_debug.assert_not_called()


def test_log_system_non_string_content_noop():
    with patch("app.utils.llm_client.logger.debug") as mock_debug:
        _log_system_prompt_sent_to_llm([{"role": "system", "content": ["block"]}])
        mock_debug.assert_not_called()


def test_log_system_logs_first_time():
    import app.utils.llm_client as m
    m._last_logged_system_prompt = None
    with patch.object(m.logger, "debug") as mock_debug:
        _log_system_prompt_sent_to_llm([{"role": "system", "content": "sys msg"}])
        mock_debug.assert_called_once()
        assert mock_debug.call_args[0][2] == "sys msg"


def test_log_system_dedup_same_content():
    import app.utils.llm_client as m
    m._last_logged_system_prompt = "sys msg"
    with patch.object(m.logger, "debug") as mock_debug:
        _log_system_prompt_sent_to_llm([{"role": "system", "content": "sys msg"}])
        mock_debug.assert_not_called()


def test_log_system_logs_different_content():
    import app.utils.llm_client as m
    m._last_logged_system_prompt = "old msg"
    with patch.object(m.logger, "debug") as mock_debug:
        _log_system_prompt_sent_to_llm([{"role": "system", "content": "new msg"}])
        mock_debug.assert_called_once()


# ── _log_last_user_message_sent_to_llm ─────────────────────────────────────

def test_log_user_no_user_messages_noop():
    with patch("app.utils.llm_client.logger.debug") as mock_debug:
        _log_last_user_message_sent_to_llm([{"role": "system", "content": "sys"}])
        mock_debug.assert_not_called()


def test_log_user_non_string_content_skipped():
    import app.utils.llm_client as m
    m._last_logged_user_message = None
    with patch.object(m.logger, "debug") as mock_debug:
        _log_last_user_message_sent_to_llm([{"role": "user", "content": ["block"]}])
        mock_debug.assert_not_called()


def test_log_user_logs_last_string_message():
    import app.utils.llm_client as m
    m._last_logged_user_message = None
    with patch.object(m.logger, "debug") as mock_debug:
        _log_last_user_message_sent_to_llm([
            {"role": "user", "content": "first"},
            {"role": "user", "content": "second"},
        ])
        mock_debug.assert_called_once()
        # loguru format: logger.debug("...full_len={}{}\n...", len(last), extra, last)
        assert mock_debug.call_args[0][3] == "second"
        assert "user_role_str_msgs=2" in mock_debug.call_args[0][2]


def test_log_user_dedup_same_last_message():
    import app.utils.llm_client as m
    m._last_logged_user_message = "same msg"
    with patch.object(m.logger, "debug") as mock_debug:
        _log_last_user_message_sent_to_llm([{"role": "user", "content": "same msg"}])
        mock_debug.assert_not_called()


# ── _assistant_message_from_stream_parts ───────────────────────────────────

def test_assistant_message_no_tool_parts():
    result = _assistant_message_from_stream_parts("hello world", {})
    assert result.role == "assistant"
    assert result.content == "hello world"
    assert result.tool_calls is None


def test_assistant_message_empty_content_no_tools():
    result = _assistant_message_from_stream_parts("", {})
    assert result.role == "assistant"
    assert result.content is None
    assert result.tool_calls is None


def test_assistant_message_with_single_tool():
    result = _assistant_message_from_stream_parts("", {
        0: {"id": "tc1", "name": "read_file", "arguments": '{"path":"/tmp"}'}
    })
    assert result.tool_calls is not None
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].id == "tc1"
    assert result.tool_calls[0].function.name == "read_file"


def test_assistant_message_multiple_tools_sorted():
    result = _assistant_message_from_stream_parts("content", {
        2: {"id": "tc3", "name": "tool3", "arguments": "{}"},
        1: {"id": "tc2", "name": "tool2", "arguments": "{}"},
    })
    assert len(result.tool_calls) == 2
    assert result.tool_calls[0].id == "tc2"
    assert result.tool_calls[1].id == "tc3"


def test_assistant_message_tool_missing_fields_defaults():
    result = _assistant_message_from_stream_parts("", {
        0: {"id": "", "name": "", "arguments": ""}
    })
    assert result.tool_calls[0].id == ""
    assert result.tool_calls[0].function.name == ""
    assert result.tool_calls[0].function.arguments == "{}"
