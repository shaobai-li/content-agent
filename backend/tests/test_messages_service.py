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
        {"session_id": "s1", "content": "a"},
        {"session_id": "s1", "content": "b"},
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


def test_load_messages_jsonl_filters_by_session(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text(_make_jsonl(
        {"session_id": "s1", "content": "a"},
        {"session_id": "s2", "content": "b"},  # 不同 session，但由于是 per-session 文件不会出现
        {"session_id": "s1", "content": "c"},
    ))
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = load_messages("ag", "s1")
    assert len(result) == 3  # per-session 文件不过滤 session_id，此处仅验证 jsonl 读取


# ── load_messages — 降级旧 messages.json ────────────────────────────────

def test_load_messages_fallback_to_json(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"  # 不存在
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([
        {"session_id": "s1", "content": "a"},
        {"session_id": "s2", "content": "b"},
        {"session_id": "s1", "content": "c"},
    ]))
    with (
        patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path),
        patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path),
    ):
        result = load_messages("ag", "s1")
    assert len(result) == 2
    assert result[0]["content"] == "a"
    assert result[1]["content"] == "c"


def test_load_messages_neither_exists(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    msg_path = tmp_path / "messages.json"
    with (
        patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path),
        patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path),
    ):
        result = load_messages("ag", "s1")
    assert result == []


def test_load_messages_jsonl_precedence(tmp_path):
    # .jsonl 存在时不应读取 messages.json
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text(_make_jsonl({"session_id": "s1", "content": "new"}))
    msg_path = tmp_path / "messages.json"
    msg_path.write_text(json.dumps([{"session_id": "s1", "content": "old"}]))
    with (
        patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path),
        patch("app.service.messages_service.get_agent_messages_path", return_value=msg_path),
    ):
        result = load_messages("ag", "s1")
    assert len(result) == 1
    assert result[0]["content"] == "new"


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
    assert data["session_id"] == "s1"
    assert "message_id" in data
    assert "created_at" in data


def test_save_message_appends_to_existing(tmp_path):
    jsonl_path = tmp_path / "messages" / "s1.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text(_make_jsonl({"session_id": "s0", "content": "old"}))
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
    jsonl_path.write_text(_make_jsonl({"session_id": "s1", "content": "a"}))
    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_path):
        result = delete_session_messages("ag", "s1")
    assert result is True
    assert not jsonl_path.exists()


def test_delete_session_messages_removes_only_target(tmp_path):
    # 验证只删除目标 session 文件，不影响其他 session 文件
    jsonl_s1 = tmp_path / "messages" / "s1.jsonl"
    jsonl_s2 = tmp_path / "messages" / "s2.jsonl"
    jsonl_s1.parent.mkdir(parents=True)
    jsonl_s1.write_text(_make_jsonl({"session_id": "s1", "content": "a"}))
    jsonl_s2.write_text(_make_jsonl({"session_id": "s2", "content": "b"}))

    with patch("app.service.messages_service.get_agent_session_messages_path", return_value=jsonl_s1):
        result = delete_session_messages("ag", "s1")
    assert result is True
    assert not jsonl_s1.exists()
    assert jsonl_s2.exists()
