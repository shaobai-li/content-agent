import json
from unittest.mock import patch
import pytest
from app.service.messages_service import load_messages, save_message, delete_session_messages


# ── load_messages ──────────────────────────────────────────────────────────

def test_load_messages_file_not_exists(tmp_path):
    msg_path = tmp_path / "messages.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = load_messages("ag", "s1")
        assert result == []


def test_load_messages_file_empty(tmp_path):
    msg_path = tmp_path / "messages.json"
    msg_path.write_text("[]")
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = load_messages("ag", "s1")
        assert result == []


def test_load_messages_filters_by_session(tmp_path):
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([
        {"session_id": "s1", "content": "a"},
        {"session_id": "s2", "content": "b"},
        {"session_id": "s1", "content": "c"},
    ]))
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = load_messages("ag", "s1")
        assert len(result) == 2
        assert result[0]["content"] == "a"
        assert result[1]["content"] == "c"


def test_load_messages_no_match_returns_empty(tmp_path):
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([{"session_id": "s2", "content": "x"}]))
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = load_messages("ag", "s1")
        assert result == []


# ── save_message ───────────────────────────────────────────────────────────

def test_save_message_new_file(tmp_path):
    msg_path = tmp_path / "messages.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        save_message("ag", "s1", "user", "hello")
    data = json.loads(msg_path.read_text())
    assert len(data) == 1
    assert data[0]["role"] == "user"
    assert data[0]["content"] == "hello"
    assert data[0]["session_id"] == "s1"
    assert "message_id" in data[0]
    assert "created_at" in data[0]


def test_save_message_appends_to_existing(tmp_path):
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([{"session_id": "s0", "content": "old"}]))
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        save_message("ag", "s1", "assistant", "new")
    data = json.loads(msg_path.read_text())
    assert len(data) == 2
    assert data[0]["content"] == "old"
    assert data[1]["content"] == "new"


def test_save_message_with_tool_calls(tmp_path):
    msg_path = tmp_path / "messages.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        save_message("ag", "s1", "assistant", "", tool_calls=[{"id": "tc1"}])
    data = json.loads(msg_path.read_text())
    assert data[0]["tool_calls"] == [{"id": "tc1"}]


def test_save_message_with_tool_call_id(tmp_path):
    msg_path = tmp_path / "messages.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        save_message("ag", "s1", "tool", "result", tool_call_id="tc1")
    data = json.loads(msg_path.read_text())
    assert data[0]["tool_call_id"] == "tc1"


def test_save_message_creates_parent_dirs(tmp_path):
    msg_path = tmp_path / "sub" / "nested" / "messages.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        save_message("ag", "s1", "user", "hello")
    assert msg_path.exists()


def test_save_message_none_content(tmp_path):
    msg_path = tmp_path / "messages.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        save_message("ag", "s1", "user", None)
    data = json.loads(msg_path.read_text())
    assert data[0]["content"] is None


# ── delete_session_messages ────────────────────────────────────────────────

def test_delete_session_messages_file_not_exists(tmp_path):
    msg_path = tmp_path / "nonexistent.json"
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = delete_session_messages("ag", "s1")
        assert result is True


def test_delete_session_messages_removes_session(tmp_path):
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([
        {"session_id": "s1", "content": "a"},
        {"session_id": "s2", "content": "b"},
        {"session_id": "s1", "content": "c"},
    ]))
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = delete_session_messages("ag", "s1")
    assert result is True
    data = json.loads(msg_path.read_text())
    assert len(data) == 1
    assert data[0]["content"] == "b"


def test_delete_session_messages_no_match_keeps_all(tmp_path):
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([{"session_id": "s2", "content": "x"}]))
    with patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path):
        result = delete_session_messages("ag", "s1")
    assert result is True
    data = json.loads(msg_path.read_text())
    assert len(data) == 1
