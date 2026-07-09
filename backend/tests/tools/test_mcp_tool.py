"""Tests for MCP tool integration — sanitize, schema normalization, transient detection."""
from app.agents.tools.mcp import (
    _extract_nullable_branch,
    _is_transient,
    _normalize_schema_for_openai,
    _sanitize_name,
)


class TestSanitizeName:
    def test_sanitize_special_chars(self):
        assert _sanitize_name("hello world") == "hello_world"
        assert _sanitize_name("tool/name") == "tool_name"
        assert _sanitize_name("a.b.c") == "a_b_c"

    def test_sanitize_preserve_normal(self):
        assert _sanitize_name("my_tool") == "my_tool"
        assert _sanitize_name("read-file_v2") == "read-file_v2"

    def test_sanitize_collapse_underscores(self):
        # 连续特殊字符被替换为单个下划线（_SANITIZE_RE 合并 _+）
        assert _sanitize_name("a///b") == "a_b"


class TestNormalizeSchemaForOpenAI:
    def test_pass_through_plain_object(self):
        schema = {"type": "object", "properties": {"x": {"type": "string"}}}
        result = _normalize_schema_for_openai(schema)
        assert result["type"] == "object"
        assert "properties" in result

    def test_nullable_type_array(self):
        schema = {
            "type": "object",
            "properties": {"name": {"type": ["string", "null"]}},
        }
        result = _normalize_schema_for_openai(schema)
        assert result["properties"]["name"]["type"] == "string"
        assert result["properties"]["name"]["nullable"] is True

    def test_anyof_nullable(self):
        schema = {
            "type": "object",
            "properties": {
                "x": {
                    "anyOf": [
                        {"type": "string"},
                        {"type": "null"},
                    ],
                },
            },
        }
        result = _normalize_schema_for_openai(schema)
        x = result["properties"]["x"]
        assert x["type"] == "string"
        assert x["nullable"] is True

    def test_non_dict_returns_default(self):
        result = _normalize_schema_for_openai("not_a_dict")
        assert result == {"type": "object", "properties": {}}

    def test_required_setdefault(self):
        schema = {"type": "object", "properties": {}}
        result = _normalize_schema_for_openai(schema)
        assert result["required"] == []


class TestExtractNullableBranch:
    def test_single_non_null_with_null(self):
        options = [{"type": "string"}, {"type": "null"}]
        result = _extract_nullable_branch(options)
        assert result is not None
        branch, nullable = result
        assert branch == {"type": "string"}
        assert nullable is True

    def test_multiple_non_null(self):
        options = [{"type": "string"}, {"type": "integer"}, {"type": "null"}]
        assert _extract_nullable_branch(options) is None

    def test_no_null(self):
        options = [{"type": "string"}, {"type": "integer"}]
        assert _extract_nullable_branch(options) is None

    def test_not_list(self):
        assert _extract_nullable_branch("foo") is None


class TestIsTransient:
    def test_transient_errors(self):
        assert _is_transient(BrokenPipeError()) is True
        assert _is_transient(ConnectionResetError()) is True
        assert _is_transient(ConnectionRefusedError()) is True
        assert _is_transient(ConnectionAbortedError()) is True

    def test_non_transient_errors(self):
        assert _is_transient(ValueError()) is False
        assert _is_transient(RuntimeError()) is False
        assert _is_transient(KeyError()) is False
