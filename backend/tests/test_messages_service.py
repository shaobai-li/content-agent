import json
from unittest.mock import patch
import pytest
from app.service.messages_service import load_messages, save_message, delete_session_messages


# ── 辅助：构建 .jsonl 内容 ──────────────────────────────────────────────

def _make_jsonl(*messages) -> str:
    return "\n".join(json.dumps(m, ensure_ascii=False) for m in messages) + "\n"


# ── load_messages — .jsonl 优先 ─────────────────────────────────────────

def test_load_messages_from_jsonl(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text(_make_jsonl(
        {"content": "a"},
        {"content": "b"},
    ))
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = load_messages("ag", "s1")
    assert len(result) == 2
    assert result[0]["content"] == "a"
    assert result[1]["content"] == "b"


def test_load_messages_jsonl_empty(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text("")
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = load_messages("ag", "s1")
    assert result == []


def test_load_messages_jsonl_not_exists(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = load_messages("ag", "s1")
    assert result == []


# ── save_message ─────────────────────────────────────────────────────────

def test_save_message_new_jsonl(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "user", "hello")
    lines = jsonl_path.read_text().strip().splitlines()
    assert len(lines) == 1
    data = json.loads(lines[0])
    assert data["role"] == "user"
    assert data["content"] == "hello"
    assert "session_id" not in data
    assert "message_id" in data
    assert "created_at" in data


def test_save_message_appends_to_existing(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text(_make_jsonl({"content": "old"}))
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "assistant", "new")
    lines = jsonl_path.read_text().strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["content"] == "old"
    assert json.loads(lines[1])["content"] == "new"


def test_save_message_with_tool_calls(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "assistant", "", tool_calls=[{"id": "tc1"}])
    data = json.loads(jsonl_path.read_text().strip().splitlines()[0])
    assert data["tool_calls"] == [{"id": "tc1"}]


def test_save_message_with_tool_call_id(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "tool", "result", tool_call_id="tc1")
    data = json.loads(jsonl_path.read_text().strip().splitlines()[0])
    assert data["tool_call_id"] == "tc1"


def test_save_message_with_name(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "tool", "result", name="get_weather")
    data = json.loads(jsonl_path.read_text().strip().splitlines()[0])
    assert data["name"] == "get_weather"


def test_save_message_with_reasoning_content(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "assistant", "hello", reasoning_content="thinking...")
    data = json.loads(jsonl_path.read_text().strip().splitlines()[0])
    assert data["reasoning_content"] == "thinking..."


def test_save_message_creates_parent_dirs(tmp_path):
    jsonl_path = tmp_path / "deeply" / "nested" / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "user", "hello")
    assert jsonl_path.exists()


def test_save_message_none_content(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        save_message("ag", "s1", "user", None)
    data = json.loads(jsonl_path.read_text().strip().splitlines()[0])
    assert data["content"] is None


# ── delete_session_messages ──────────────────────────────────────────────

def test_delete_session_messages_file_not_exists(tmp_path):
    jsonl_path = tmp_path / "messages" / "nonexistent.jsonl"
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = delete_session_messages("ag", "s1")
    assert result is True


def test_delete_session_messages_removes_jsonl(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text(_make_jsonl({"content": "a"}))
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = delete_session_messages("ag", "s1")
    assert result is True
    assert not jsonl_path.exists()


def test_delete_session_messages_removes_only_target(tmp_path):
    # 验证只删除目标 session 文件，不影响其他 session 文件
    jsonl_s1 = tmp_path / "messages" / "s1.jsonl"
    jsonl_s2 = tmp_path / "messages" / "s2.jsonl"
    jsonl_s1.parent.mkdir(parents=True)
    jsonl_s1.write_text(_make_jsonl({"content": "a"}))
    jsonl_s2.write_text(_make_jsonl({"content": "b"}))

    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_s1):
        result = delete_session_messages("ag", "s1")
    assert result is True
    assert not jsonl_s1.exists()
    assert jsonl_s2.exists()
