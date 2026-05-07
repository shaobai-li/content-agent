import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.agents.standard.agent import _history_llm_turns, StandardAgent
from app.runtime.agent_turn_context import AgentTurnContext


# ── 辅助：快速构造 AgentTurnContext（绕过 I/O） ───────────────────────

def _make_ctx(history=None, user_text="hi", mentions=None, session_id="s1"):
    return AgentTurnContext(
        agent_id="agent1",
        session_id=session_id,
        mentions=mentions or [],
        user_text=user_text,
        attachments=None,
        resolved_attachment_paths=(),
        history_messages=history or [],
    )


# ── _history_llm_turns ────────────────────────────────────────────────

class TestHistoryLlmTurns:
    def test_empty_input_returns_empty(self):
        assert _history_llm_turns([]) == []

    def test_user_message_preserved(self):
        result = _history_llm_turns([{"role": "user", "content": "hello"}])
        assert len(result) == 1
        assert result[0] == {"role": "user", "content": "hello"}

    def test_assistant_message_preserved(self):
        result = _history_llm_turns([{"role": "assistant", "content": "reply"}])
        assert result[0] == {"role": "assistant", "content": "reply"}

    def test_assistant_tool_calls_included(self):
        tc = [{"id": "tc1", "function": {"name": "foo"}}]
        result = _history_llm_turns([
            {"role": "assistant", "content": "", "tool_calls": tc}
        ])
        assert result[0]["tool_calls"] == tc

    def test_tool_message_preserved_with_tool_call_id(self):
        result = _history_llm_turns([
            {"role": "tool", "content": "result", "tool_call_id": "tc1"}
        ])
        assert result[0] == {"role": "tool", "content": "result", "tool_call_id": "tc1"}

    def test_tool_message_empty_content_defaults_to_empty_string(self):
        result = _history_llm_turns([{"role": "tool", "content": None}])
        assert result[0]["content"] == ""

    def test_unknown_role_is_dropped(self):
        result = _history_llm_turns([{"role": "system", "content": "ignored"}])
        assert result == []

    def test_extra_fields_stripped_from_user_message(self):
        result = _history_llm_turns([
            {"role": "user", "content": "hi", "message_id": "x", "created_at": "t"}
        ])
        assert "message_id" not in result[0]
        assert "created_at" not in result[0]

    def test_order_preserved(self):
        history = [
            {"role": "user", "content": "q1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "q2"},
        ]
        result = _history_llm_turns(history)
        assert [m["content"] for m in result] == ["q1", "a1", "q2"]

    def test_tool_calls_not_included_when_absent(self):
        result = _history_llm_turns([{"role": "assistant", "content": "plain"}])
        assert "tool_calls" not in result[0]

    def test_tool_call_id_not_included_when_absent(self):
        result = _history_llm_turns([{"role": "tool", "content": "ok"}])
        assert "tool_call_id" not in result[0]


# ── StandardAgent._build_loop_messages ───────────────────────────────

class TestBuildLoopMessages:
    @patch("app.agents.standard.agent.ContextBuilder")
    @patch("app.agents.standard.agent.get_agent_workspace_dir")
    def test_passes_history_and_text_to_builder(self, mock_ws, mock_cb_cls):
        mock_ws.return_value = Path("/tmp/ws")
        mock_builder = MagicMock()
        mock_builder.build_messages.return_value = [{"role": "user", "content": "hi"}]
        mock_cb_cls.return_value = mock_builder

        agent = StandardAgent.__new__(StandardAgent)
        agent.agent_id = "agent1"

        ctx = _make_ctx(
            history=[{"role": "user", "content": "prev"}],
            user_text="hello",
            mentions=[{"name": "doc"}],
        )
        result = agent._build_loop_messages(ctx, Path("/tmp/ws"))

        mock_builder.build_messages.assert_called_once()
        call_kwargs = mock_builder.build_messages.call_args
        assert call_kwargs.kwargs["current_message"] == "hello"
        assert call_kwargs.kwargs["mentions"] == [{"name": "doc"}]

    @patch("app.agents.standard.agent.ContextBuilder")
    @patch("app.agents.standard.agent.get_agent_workspace_dir")
    def test_returns_builder_output(self, mock_ws, mock_cb_cls):
        mock_ws.return_value = Path("/tmp/ws")
        expected = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
        mock_cb_cls.return_value.build_messages.return_value = expected

        agent = StandardAgent.__new__(StandardAgent)
        agent.agent_id = "agent1"

        result = agent._build_loop_messages(_make_ctx(), Path("/tmp/ws"))
        assert result == expected

    @patch("app.agents.standard.agent.ContextBuilder")
    @patch("app.agents.standard.agent.get_agent_workspace_dir")
    def test_history_is_filtered_through_history_llm_turns(self, mock_ws, mock_cb_cls):
        """history 中多余字段（message_id 等）不应传给 builder。"""
        mock_ws.return_value = Path("/tmp/ws")
        mock_builder = MagicMock()
        mock_builder.build_messages.return_value = []
        mock_cb_cls.return_value = mock_builder

        agent = StandardAgent.__new__(StandardAgent)
        agent.agent_id = "agent1"

        dirty_history = [
            {"role": "user", "content": "q", "message_id": "abc", "created_at": "t"}
        ]
        agent._build_loop_messages(_make_ctx(history=dirty_history), Path("/tmp/ws"))

        passed_history = mock_builder.build_messages.call_args.kwargs["history"]
        assert "message_id" not in passed_history[0]
