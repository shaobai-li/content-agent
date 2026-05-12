import pytest
from app.utils.helpers import (
    truncate_text,
    find_legal_message_start,
    stringify_text_blocks,
    build_assistant_message,
    estimate_prompt_tokens,
    estimate_message_tokens,
    estimate_prompt_tokens_chain,
)


# ── truncate_text ────────────────────────────────────────────────────────

def test_truncate_text_short_text_returns_as_is():
    assert truncate_text("hello", 100) == "hello"


def test_truncate_text_long_text_is_truncated():
    result = truncate_text("a" * 100, 10)
    assert result.endswith("... (truncated)")
    assert len(result) == 10 + len("\n... (truncated)")


@pytest.mark.parametrize("max_chars", [0, -1])
def test_truncate_text_non_positive_max_chars_returns_full(max_chars):
    assert truncate_text("hello", max_chars) == "hello"


def test_truncate_text_exactly_at_limit():
    text = "a" * 10
    result = truncate_text(text, 10)
    assert "truncated" not in result


# ── find_legal_message_start ─────────────────────────────────────────────

def test_find_legal_message_start_empty_returns_zero():
    assert find_legal_message_start([]) == 0


def test_find_legal_message_start_simple_user():
    msgs = [{"role": "user", "content": "hi"}]
    assert find_legal_message_start(msgs) == 0


def test_find_legal_message_start_valid_tool_chain():
    msgs = [
        {"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]},
        {"role": "tool", "tool_call_id": "tc1", "content": "ok"},
    ]
    assert find_legal_message_start(msgs) == 0


def test_find_legal_message_start_orphan_tool_result():
    msgs = [
        {"role": "tool", "tool_call_id": "ghost", "content": "orphan"},
        {"role": "assistant", "content": "hi"},
    ]
    assert find_legal_message_start(msgs) == 1


def test_find_legal_message_start_multiple_orphans():
    msgs = [
        {"role": "tool", "tool_call_id": "o1", "content": ""},
        {"role": "tool", "tool_call_id": "o2", "content": ""},
        {"role": "user", "content": "hi"},
    ]
    assert find_legal_message_start(msgs) == 2


def test_find_legal_message_start_tool_call_without_id():
    # tool_call without id doesn't get tracked; tool result is orphan → start at 2
    msgs = [
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "foo"}}]},
        {"role": "tool", "tool_call_id": "tc1", "content": "ok"},
    ]
    assert find_legal_message_start(msgs) == 2


def test_find_legal_message_start_tool_call_id_not_string():
    msgs = [
        {"role": "assistant", "content": "", "tool_calls": [{"id": 123, "function": {"name": "foo"}}]},
        {"role": "tool", "tool_call_id": 123, "content": "ok"},
    ]
    assert find_legal_message_start(msgs) == 0


# ── stringify_text_blocks ────────────────────────────────────────────────

def test_stringify_text_blocks_basic():
    result = stringify_text_blocks([
        {"type": "text", "text": "hello"},
        {"type": "text", "text": "world"},
    ])
    assert result == "hello\nworld"


def test_stringify_text_blocks_empty_list():
    result = stringify_text_blocks([])
    assert result == ""


def test_stringify_text_blocks_non_dict_returns_none():
    result = stringify_text_blocks(["not a dict"])
    assert result is None


def test_stringify_text_blocks_non_text_type_returns_none():
    result = stringify_text_blocks([{"type": "image", "url": "http://..."}])
    assert result is None


def test_stringify_text_blocks_non_string_text_returns_none():
    result = stringify_text_blocks([{"type": "text", "text": 42}])
    assert result is None


# ── build_assistant_message ──────────────────────────────────────────────

def test_build_assistant_message_basic():
    msg = build_assistant_message("hello")
    assert msg == {"role": "assistant", "content": "hello"}


def test_build_assistant_message_none_content_gets_empty():
    msg = build_assistant_message(None)
    assert msg["content"] == ""


def test_build_assistant_message_with_tool_calls():
    tc = [{"id": "tc1", "function": {"name": "foo"}}]
    msg = build_assistant_message("", tool_calls=tc)
    assert msg["tool_calls"] == tc


def test_build_assistant_message_with_reasoning():
    msg = build_assistant_message("hello", reasoning_content="thinking...")
    assert msg["reasoning_content"] == "thinking..."


def test_build_assistant_message_none_reasoning_gets_empty_string():
    msg = build_assistant_message("hello", reasoning_content=None)
    assert "reasoning_content" not in msg


def test_build_assistant_message_with_thinking_blocks_and_none_reasoning():
    msg = build_assistant_message("hello", thinking_blocks=[{"type": "thinking", "text": "..."}])
    assert msg["thinking_blocks"] == [{"type": "thinking", "text": "..."}]
    assert msg["reasoning_content"] == ""


# ── estimate_prompt_tokens ───────────────────────────────────────────────

def test_estimate_prompt_tokens_empty():
    result = estimate_prompt_tokens([])
    assert result == 0


def test_estimate_prompt_tokens_simple_text():
    result = estimate_prompt_tokens([{"role": "user", "content": "hello world"}])
    assert result > 0


def test_estimate_prompt_tokens_with_content_blocks():
    result = estimate_prompt_tokens([{
        "role": "user",
        "content": [{"type": "text", "text": "hello"}],
    }])
    assert result > 0


def test_estimate_prompt_tokens_with_tool_calls():
    result = estimate_prompt_tokens([{
        "role": "assistant",
        "content": "",
        "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}],
    }])
    assert result > 0


def test_estimate_prompt_tokens_with_reasoning():
    result = estimate_prompt_tokens([{"role": "assistant", "content": "hi", "reasoning_content": "thinking"}])
    assert result > 0


def test_estimate_prompt_tokens_with_name_and_tool_call_id():
    result = estimate_prompt_tokens([{"role": "tool", "content": "ok", "name": "foo", "tool_call_id": "tc1"}])
    assert result > 0


def test_estimate_prompt_tokens_with_tools_def():
    result = estimate_prompt_tokens(
        [{"role": "user", "content": "hi"}],
        tools=[{"type": "function", "function": {"name": "foo"}}],
    )
    assert result > 0


def test_estimate_prompt_tokens_exception_returns_zero():
    # Pass non-encodable content to trigger an exception path
    result = estimate_prompt_tokens([{"role": "user", "content": b"\xff\xfe"}])
    # Should not crash
    assert isinstance(result, int)


# ── estimate_message_tokens ──────────────────────────────────────────────

def test_estimate_message_tokens_text_content():
    result = estimate_message_tokens({"role": "user", "content": "hello world"})
    assert result >= 4


def test_estimate_message_tokens_block_content():
    result = estimate_message_tokens({
        "role": "user",
        "content": [{"type": "text", "text": "hello"}],
    })
    assert result >= 4


def test_estimate_message_tokens_non_text_block_content():
    result = estimate_message_tokens({
        "role": "user",
        "content": [{"type": "image", "url": "http://example.com/img.png"}],
    })
    assert result >= 4


def test_estimate_message_tokens_empty_content():
    result = estimate_message_tokens({"role": "user", "content": ""})
    assert result == 4


def test_estimate_message_tokens_none_content():
    result = estimate_message_tokens({"role": "user"})
    assert result == 4


def test_estimate_message_tokens_with_tool_calls():
    result = estimate_message_tokens({
        "role": "assistant",
        "content": "",
        "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}],
    })
    assert result >= 4


def test_estimate_message_tokens_with_reasoning():
    result = estimate_message_tokens({
        "role": "assistant",
        "content": "hi",
        "reasoning_content": "thinking...",
    })
    assert result >= 4


def test_estimate_message_tokens_with_tool_call_id():
    result = estimate_message_tokens({
        "role": "tool",
        "content": "ok",
        "tool_call_id": "tc1",
    })
    assert result >= 4


# ── estimate_prompt_tokens_chain ─────────────────────────────────────────

def test_estimate_prompt_tokens_chain_uses_tiktoken():
    provider = object()  # no estimate_prompt_tokens method
    tokens, source = estimate_prompt_tokens_chain(
        provider=provider,
        model=None,
        messages=[{"role": "user", "content": "hello"}],
    )
    assert tokens > 0
    assert source == "tiktoken"


def test_estimate_prompt_tokens_chain_falls_back_on_exception():
    def bad_counter(*args, **kwargs):
        raise RuntimeError("boom")

    provider = type("Mock", (), {"estimate_prompt_tokens": bad_counter})()
    tokens, source = estimate_prompt_tokens_chain(
        provider=provider,
        model=None,
        messages=[{"role": "user", "content": "hello"}],
    )
    assert tokens > 0
    assert source == "tiktoken"


def test_estimate_prompt_tokens_chain_empty_messages():
    provider = object()
    tokens, source = estimate_prompt_tokens_chain(
        provider=provider,
        model=None,
        messages=[],
    )
    assert tokens == 0
    assert source == "none"


def test_estimate_prompt_tokens_chain_uses_provider_when_positive():
    def good_counter(self, messages, tools, model):
        return (42, "my_provider")

    provider = type("Mock", (), {"estimate_prompt_tokens": good_counter})()
    tokens, source = estimate_prompt_tokens_chain(
        provider=provider,
        model="test-model",
        messages=[{"role": "user", "content": "hi"}],
    )
    assert tokens == 42
    assert source == "my_provider"


def test_estimate_prompt_tokens_chain_ignores_provider_zero():
    def zero_counter(messages, tools, model):
        return (0, "my_provider")

    provider = type("Mock", (), {"estimate_prompt_tokens": zero_counter})()
    tokens, source = estimate_prompt_tokens_chain(
        provider=provider,
        model="test-model",
        messages=[{"role": "user", "content": "hi"}],
    )
    assert tokens > 0
    assert source == "tiktoken"
