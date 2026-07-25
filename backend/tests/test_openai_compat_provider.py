import pytest
from app.providers.openai_compat_provider import (
    OpenAICompatProvider,
    _safe_json_loads,
)


class TestSafeJsonLoads:
    def test_valid_json_object(self):
        assert _safe_json_loads('{"a": 1}') == {"a": 1}

    def test_valid_json_list(self):
        assert _safe_json_loads('[1, 2]') == [1, 2]

    def test_empty_string_returns_none(self):
        assert _safe_json_loads("") is None

    def test_whitespace_only_returns_none(self):
        assert _safe_json_loads("   ") is None

    def test_unquoted_keys_repaired(self):
        result = _safe_json_loads('{key: "value"}')
        assert result == {"key": "value"}

    def test_completely_invalid_returns_none(self):
        assert _safe_json_loads("not json at all!!!") is None

class TestNormalizeToolCallId:
    def test_9_char_alnum_returned_as_is(self):
        tid = "abc123XYZ"
        assert OpenAICompatProvider._normalize_tool_call_id(tid) == tid

    def test_long_id_hashed_to_9_chars(self):
        result = OpenAICompatProvider._normalize_tool_call_id("call_some_long_id_from_openai")
        assert len(result) == 9
        assert result.isalnum()

    def test_non_string_returned_as_is(self):
        assert OpenAICompatProvider._normalize_tool_call_id(42) == 42

    def test_same_input_produces_same_hash(self):
        tid = "call_repeated"
        assert (
            OpenAICompatProvider._normalize_tool_call_id(tid)
            == OpenAICompatProvider._normalize_tool_call_id(tid)
        )


class TestNormalizeToolCallArguments:
    def test_valid_json_string_returned_as_json(self):
        result = OpenAICompatProvider._normalize_tool_call_arguments('{"k": "v"}')
        assert result == '{"k": "v"}'

    def test_empty_string_returns_empty_object(self):
        assert OpenAICompatProvider._normalize_tool_call_arguments("") == "{}"

    def test_dict_serialized_to_json_string(self):
        result = OpenAICompatProvider._normalize_tool_call_arguments({"a": 1})
        assert result == '{"a": 1}'

    def test_invalid_json_string_returns_empty_object(self):
        assert OpenAICompatProvider._normalize_tool_call_arguments("not json") == "{}"

    def test_none_returns_empty_object(self):
        assert OpenAICompatProvider._normalize_tool_call_arguments(None) == "{}"


class TestSupportsTemperature:
    def test_standard_model_supports_temperature(self):
        assert OpenAICompatProvider._supports_temperature("deepseek-v4-flash") is True

    def test_o1_model_does_not_support_temperature(self):
        assert OpenAICompatProvider._supports_temperature("o1-mini") is False

    def test_o3_model_does_not_support_temperature(self):
        assert OpenAICompatProvider._supports_temperature("o3") is False

    def test_non_none_reasoning_effort_disables_temperature(self):
        assert OpenAICompatProvider._supports_temperature("deepseek-v4-flash", "medium") is False

    def test_reasoning_effort_none_keeps_temperature(self):
        assert OpenAICompatProvider._supports_temperature("deepseek-v4-flash", "none") is True


class TestExtractTextContent:
    def test_string_returned_as_is(self):
        assert OpenAICompatProvider._extract_text_content("hello") == "hello"

    def test_none_returns_none(self):
        assert OpenAICompatProvider._extract_text_content(None) is None

    def test_list_of_text_dicts_joined(self):
        result = OpenAICompatProvider._extract_text_content([
            {"type": "text", "text": "hello "},
            {"type": "text", "text": "world"},
        ])
        assert result == "hello world"

    def test_empty_list_returns_none(self):
        assert OpenAICompatProvider._extract_text_content([]) is None

    def test_non_string_value_coerced(self):
        result = OpenAICompatProvider._extract_text_content(42)
        assert result == "42"


class TestGetNestedInt:
    def test_single_key_dict(self):
        assert OpenAICompatProvider._get_nested_int({"a": 5}, ("a",)) == 5

    def test_nested_path(self):
        obj = {"details": {"cached_tokens": 10}}
        assert OpenAICompatProvider._get_nested_int(obj, ("details", "cached_tokens")) == 10

    def test_missing_key_returns_zero(self):
        assert OpenAICompatProvider._get_nested_int({}, ("missing",)) == 0

    def test_none_value_returns_zero(self):
        assert OpenAICompatProvider._get_nested_int({"a": None}, ("a",)) == 0


class TestExtractUsage:
    def test_dict_response_parsed(self):
        response = {
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30,
            }
        }
        result = OpenAICompatProvider._extract_usage(response)
        assert result["prompt_tokens"] == 10
        assert result["completion_tokens"] == 20
        assert result["total_tokens"] == 30

    def test_missing_usage_returns_empty(self):
        assert OpenAICompatProvider._extract_usage({}) == {}

    def test_cached_tokens_from_prompt_cache_hit_tokens(self):
        response = {
            "usage": {
                "prompt_tokens": 5,
                "completion_tokens": 5,
                "total_tokens": 10,
                "prompt_cache_hit_tokens": 3,
            }
        }
        result = OpenAICompatProvider._extract_usage(response)
        assert result.get("cached_tokens") == 3
