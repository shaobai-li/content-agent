"""Tests for app.api.management — _build_agent_summary 逻辑验证。"""

from unittest.mock import patch

import pytest
from app.api.management import _build_agent_summary


class TestBuildAgentSummary:
    """_build_agent_summary 单元测试（mock sessions / messages 文件 I/O）。"""

    def test_no_sessions(self):
        """无会话时：session_count=0, last_reply_time=None, last_session_title=None。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("std", {"name": "标准"})

        assert result["id"] == "std"
        assert result["name"] == "标准"
        assert result["locked"] is False
        assert result["model"] == "deepseek-chat"
        assert result["session_count"] == 0
        assert result["last_reply_time"] is None
        assert result["last_session_title"] is None

    def test_has_sessions_no_messages(self):
        """有会话但无消息 → session_count>0, last_session_title 有值, last_reply_time=None。"""
        sessions = [
            {"session_id": "s1", "title": "第一个会话"},
            {"session_id": "s2", "title": "第二个会话"},
        ]
        with patch("app.api.management.load_sessions", return_value=sessions), \
             patch("app.api.management.load_messages", return_value=[]):
            result = _build_agent_summary("std", {"name": "标准"})

        assert result["session_count"] == 2
        assert result["last_session_title"] == "第一个会话"
        assert result["last_reply_time"] is None

    def test_last_assistant_message_reply_time(self):
        """有 assistant 消息时 last_reply_time 取最后一条 assistant 的 created_at。"""
        sessions = [
            {"session_id": "s1", "title": "会话"},
        ]
        messages = [
            {"role": "user", "content": "hi", "created_at": "2026-05-31T10:00:00"},
            {"role": "assistant", "content": "hello", "created_at": "2026-05-31T10:00:10"},
            {"role": "user", "content": "again", "created_at": "2026-05-31T10:00:20"},
            {"role": "assistant", "content": "reply", "created_at": "2026-05-31T10:00:30"},
        ]
        with patch("app.api.management.load_sessions", return_value=sessions), \
             patch("app.api.management.load_messages", return_value=messages):
            result = _build_agent_summary("std", {"name": "标准"})

        assert result["last_reply_time"] == "2026-05-31T10:00:30"
        assert result["last_session_title"] == "会话"

    def test_no_assistant_messages(self):
        """有会话但无 assistant 消息 → last_reply_time=None。"""
        sessions = [
            {"session_id": "s1", "title": "会话"},
        ]
        messages = [
            {"role": "user", "content": "hi", "created_at": "2026-05-31T10:00:00"},
            {"role": "user", "content": "hello", "created_at": "2026-05-31T10:00:10"},
        ]
        with patch("app.api.management.load_sessions", return_value=sessions), \
             patch("app.api.management.load_messages", return_value=messages):
            result = _build_agent_summary("std", {"name": "标准"})

        assert result["last_reply_time"] is None
        assert result["last_session_title"] == "会话"

    def test_locked_agent(self):
        """locked=True 从配置透传。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("admin", {"name": "管理员", "locked": True})

        assert result["locked"] is True

    def test_name_fallback_to_agent_id(self):
        """cfg 无 name 字段时以 agent_id 作为 name。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("std", {})

        assert result["name"] == "std"

    def test_uses_first_session_for_reply_and_title(self):
        """仅用第一个会话（sessions[0]）计算 last_reply_time 和 last_session_title。"""
        sessions = [
            {"session_id": "s1", "title": "最新会话"},
        ]
        messages = [
            {"role": "assistant", "content": "ok", "created_at": "2026-05-01T12:00:00"},
        ]
        with patch("app.api.management.load_sessions", return_value=sessions), \
             patch("app.api.management.load_messages", return_value=messages):
            result = _build_agent_summary("std", {"name": "标准"})

        assert result["last_session_title"] == "最新会话"
        assert result["last_reply_time"] == "2026-05-01T12:00:00"

    # ── model 解析 ────────────────────────────────────────────────────

    def test_model_default_deepseek_chat(self):
        """无 provider/model 时兜底 deepseek-chat。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("std", {"name": "标准"})
        assert result["model"] == "deepseek-chat"

    def test_model_explicit_from_config(self):
        """YAML 中显式指定 model 则直接使用。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("std", {"name": "测试", "model": "gpt-4o"})
        assert result["model"] == "gpt-4o"

    def test_model_resolved_from_provider(self):
        """配置 provider=openai → 解析为 gpt-4o。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("std", {"name": "测试", "provider": "openai"})
        assert result["model"] == "gpt-4o"

    def test_model_unknown_provider_fallback(self):
        """未识别的 provider → {provider}-chat 格式。"""
        with patch("app.api.management.load_sessions", return_value=[]):
            result = _build_agent_summary("std", {"name": "测试", "provider": "custom-llm"})
        assert result["model"] == "custom-llm-chat"
