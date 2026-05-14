import pytest
from app.providers.base import (
    LLMProvider,
    LLMResponse,
    ToolCallRequest,
    _image_placeholder_text,
)


# ── _image_placeholder_text ─────────────────────────────────────────────────

def test_image_placeholder_with_path():
    assert _image_placeholder_text("/tmp/img.png") == "[image: /tmp/img.png]"


def test_image_placeholder_empty():
    assert _image_placeholder_text(None) == "[image]"
    assert _image_placeholder_text("") == "[image]"


def test_image_placeholder_custom_empty():
    assert _image_placeholder_text(None, empty="[no image]") == "[no image]"


# ── ToolCallRequest.to_openai_tool_call ─────────────────────────────────────

def test_to_openai_tool_call_basic():
    tc = ToolCallRequest(id="tc1", name="read_file", arguments={"path": "/tmp"})
    result = tc.to_openai_tool_call()
    assert result["id"] == "tc1"
    assert result["type"] == "function"
    assert result["function"]["name"] == "read_file"
    assert '"path": "/tmp"' in result["function"]["arguments"]


def test_to_openai_tool_call_with_extra():
    tc = ToolCallRequest(id="tc1", name="f", arguments={},
                         extra_content={"key": "val"},
                         provider_specific_fields={"ps": 1},
                         function_provider_specific_fields={"fps": 2})
    result = tc.to_openai_tool_call()
    assert result["extra_content"] == {"key": "val"}
    assert result["provider_specific_fields"] == {"ps": 1}
    assert result["function"]["provider_specific_fields"] == {"fps": 2}


# ── LLMResponse properties ──────────────────────────────────────────────────

def test_has_tool_calls_true():
    r = LLMResponse(content="", tool_calls=[ToolCallRequest("t", "f", {})])
    assert r.has_tool_calls is True


def test_has_tool_calls_false():
    assert LLMResponse(content="hi").has_tool_calls is False


def test_should_execute_tools_stop():
    r = LLMResponse(content="", tool_calls=[ToolCallRequest("t", "f", {})],
                    finish_reason="stop")
    assert r.should_execute_tools is True


def test_should_execute_tools_no_calls():
    assert LLMResponse(content="hi").should_execute_tools is False


def test_should_execute_tools_wrong_reason():
    r = LLMResponse(content="", tool_calls=[ToolCallRequest("t", "f", {})],
                    finish_reason="length")
    assert r.should_execute_tools is False


# ── _sanitize_request_messages ──────────────────────────────────────────────

def test_sanitize_request_messages_filters_keys():
    result = LLMProvider._sanitize_request_messages(
        [{"role": "user", "content": "hi", "_internal": "secret"}],
        frozenset({"role", "content"}),
    )
    assert "_internal" not in result[0]


def test_sanitize_request_messages_adds_content_to_assistant():
    result = LLMProvider._sanitize_request_messages(
        [{"role": "assistant"}],
        frozenset({"role"}),
    )
    assert result[0]["content"] is None


# ── _sanitize_empty_content ─────────────────────────────────────────────────

def test_sanitize_empty_string_content():
    result = LLMProvider._sanitize_empty_content([{"role": "user", "content": ""}])
    assert result[0]["content"] == "(empty)"


def test_sanitize_assistant_empty_with_tool_calls():
    result = LLMProvider._sanitize_empty_content(
        [{"role": "assistant", "content": "", "tool_calls": [{"id": "t"}]}]
    )
    assert result[0]["content"] is None


def test_sanitize_removes_empty_text_blocks():
    result = LLMProvider._sanitize_empty_content(
        [{"role": "user", "content": [{"type": "text", "text": ""}]}]
    )
    assert result[0]["content"] == "(empty)"


def test_sanitize_strips_meta_keys():
    result = LLMProvider._sanitize_empty_content(
        [{"role": "user", "content": [{"type": "text", "text": "hi", "_meta": {"x": 1}}]}]
    )
    assert "_meta" not in result[0]["content"][0]


def test_sanitize_dict_content_wraps():
    result = LLMProvider._sanitize_empty_content(
        [{"role": "user", "content": {"type": "text", "text": "hi"}}]
    )
    assert isinstance(result[0]["content"], list)
    assert result[0]["content"][0]["text"] == "hi"


def test_sanitize_passthrough_non_empty():
    result = LLMProvider._sanitize_empty_content([{"role": "user", "content": "hi"}])
    assert result[0] == {"role": "user", "content": "hi"}


# ── _enforce_role_alternation ──────────────────────────────────────────────

def test_enforce_role_alternation_empty():
    assert LLMProvider._enforce_role_alternation([]) == []


def test_enforce_role_alternation_merges_consecutive_user():
    result = LLMProvider._enforce_role_alternation([
        {"role": "user", "content": "a"},
        {"role": "user", "content": "b"},
    ])
    assert len(result) == 1
    assert result[0]["content"] == "a\n\nb"


def test_enforce_role_alternation_drops_trailing_assistant():
    result = LLMProvider._enforce_role_alternation([
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "ok"},
    ])
    assert result[-1]["role"] == "user"


def test_enforce_role_alternation_recovers_system_only():
    result = LLMProvider._enforce_role_alternation([
        {"role": "system", "content": "sys"},
        {"role": "assistant", "content": "final"},
    ])
    assert result[-1]["role"] == "user"
    assert result[-1]["content"] == "final"


def test_enforce_role_alternation_safety_net():
    result = LLMProvider._enforce_role_alternation([
        {"role": "system", "content": "sys"},
        {"role": "assistant", "content": "bare"},
    ])
    roles = [m["role"] for m in result]
    assert roles[1] == "user"


def test_enforce_role_alternation_tool_not_merged():
    result = LLMProvider._enforce_role_alternation([
        {"role": "tool", "content": "r1"},
        {"role": "tool", "content": "r2"},
    ])
    assert len(result) == 2
