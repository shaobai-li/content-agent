import pytest
from app.agents.runner import AgentRunner, _BACKFILL_CONTENT


# ── _merge_message_content ────────────────────────────────────────────

class TestMergeMessageContent:
    def test_two_strings_joined_with_double_newline(self):
        result = AgentRunner._merge_message_content("hello", "world")
        assert result == "hello\n\nworld"

    def test_empty_left_returns_right(self):
        result = AgentRunner._merge_message_content("", "world")
        assert result == "world"

    def test_list_and_string_returns_block_list(self):
        result = AgentRunner._merge_message_content(
            [{"type": "text", "text": "a"}], "b"
        )
        assert isinstance(result, list)
        assert result[0] == {"type": "text", "text": "a"}
        assert result[1] == {"type": "text", "text": "b"}

    def test_none_left_with_string_right(self):
        result = AgentRunner._merge_message_content(None, "hello")
        assert result == [{"type": "text", "text": "hello"}]


# ── _append_injected_messages ─────────────────────────────────────────

class TestAppendInjectedMessages:
    def test_appends_non_user_injection_directly(self):
        messages = [{"role": "assistant", "content": "hi"}]
        AgentRunner._append_injected_messages(
            messages, [{"role": "assistant", "content": "follow"}]
        )
        assert len(messages) == 2

    def test_merges_user_injection_into_last_user_message(self):
        messages = [{"role": "user", "content": "first"}]
        AgentRunner._append_injected_messages(
            messages, [{"role": "user", "content": "second"}]
        )
        assert len(messages) == 1
        assert "second" in messages[0]["content"]

    def test_appends_user_injection_when_last_is_not_user(self):
        messages = [{"role": "assistant", "content": "reply"}]
        AgentRunner._append_injected_messages(
            messages, [{"role": "user", "content": "follow-up"}]
        )
        assert len(messages) == 2
        assert messages[-1]["role"] == "user"


# ── _usage_dict / _accumulate_usage / _merge_usage ────────────────────

class TestUsageHelpers:
    def test_usage_dict_converts_values_to_int(self):
        result = AgentRunner._usage_dict({"prompt_tokens": "10", "completion_tokens": 5})
        assert result == {"prompt_tokens": 10, "completion_tokens": 5}

    def test_usage_dict_returns_empty_for_none(self):
        assert AgentRunner._usage_dict(None) == {}

    def test_accumulate_usage_adds_values(self):
        target = {"prompt_tokens": 10}
        AgentRunner._accumulate_usage(target, {"prompt_tokens": 5, "completion_tokens": 3})
        assert target == {"prompt_tokens": 15, "completion_tokens": 3}

    def test_merge_usage_returns_new_dict(self):
        result = AgentRunner._merge_usage({"a": 1}, {"a": 2, "b": 3})
        assert result == {"a": 3, "b": 3}


# ── _drop_orphan_tool_results ─────────────────────────────────────────

class TestDropOrphanToolResults:
    def test_keeps_valid_tool_result(self):
        messages = [
            {"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]},
            {"role": "tool", "tool_call_id": "tc1", "content": "ok"},
        ]
        result = AgentRunner._drop_orphan_tool_results(messages)
        assert len(result) == 2

    def test_drops_orphan_tool_result(self):
        messages = [
            {"role": "user", "content": "hi"},
            {"role": "tool", "tool_call_id": "ghost", "content": "orphan"},
        ]
        result = AgentRunner._drop_orphan_tool_results(messages)
        assert all(m.get("role") != "tool" for m in result)

    def test_returns_same_list_when_no_orphans(self):
        messages = [{"role": "user", "content": "hi"}]
        result = AgentRunner._drop_orphan_tool_results(messages)
        assert result is messages


# ── _backfill_missing_tool_results ────────────────────────────────────

class TestBackfillMissingToolResults:
    def test_inserts_synthetic_result_for_missing_tool_call(self):
        messages = [
            {"role": "assistant", "content": "", "tool_calls": [
                {"id": "tc1", "function": {"name": "my_tool"}}
            ]},
        ]
        result = AgentRunner._backfill_missing_tool_results(messages)
        tool_msgs = [m for m in result if m.get("role") == "tool"]
        assert len(tool_msgs) == 1
        assert tool_msgs[0]["tool_call_id"] == "tc1"
        assert tool_msgs[0]["content"] == _BACKFILL_CONTENT

    def test_no_change_when_all_tool_calls_fulfilled(self):
        messages = [
            {"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]},
            {"role": "tool", "tool_call_id": "tc1", "content": "done"},
        ]
        result = AgentRunner._backfill_missing_tool_results(messages)
        assert result is messages
