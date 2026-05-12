import pytest
from app.agents.tools.base import Schema, Tool, tool_parameters


# ── Schema.resolve_json_schema_type ──────────────────────────────────────

def test_resolve_json_schema_type_string():
    assert Schema.resolve_json_schema_type("string") == "string"


def test_resolve_json_schema_type_union():
    assert Schema.resolve_json_schema_type(["string", "null"]) == "string"


def test_resolve_json_schema_type_null_only_returns_none():
    assert Schema.resolve_json_schema_type(["null"]) is None


# ── Schema.subpath ───────────────────────────────────────────────────────

def test_subpath_empty_path():
    assert Schema.subpath("", "key") == "key"


def test_subpath_with_path():
    assert Schema.subpath("root", "child") == "root.child"


# ── Schema.validate_json_schema_value ────────────────────────────────────

class TestValidateString:
    def test_valid_string(self):
        assert Schema.validate_json_schema_value("hello", {"type": "string"}) == []

    def test_wrong_type(self):
        errs = Schema.validate_json_schema_value(42, {"type": "string"})
        assert len(errs) == 1
        assert "string" in errs[0]

    def test_min_length_constraint(self):
        errs = Schema.validate_json_schema_value("ab", {"type": "string", "minLength": 3})
        assert len(errs) == 1

    def test_max_length_constraint(self):
        errs = Schema.validate_json_schema_value("abcdef", {"type": "string", "maxLength": 3})
        assert len(errs) == 1

    def test_within_length_bounds(self):
        assert Schema.validate_json_schema_value("abc", {"type": "string", "minLength": 2, "maxLength": 5}) == []

    def test_enum_valid(self):
        assert Schema.validate_json_schema_value("a", {"type": "string", "enum": ["a", "b"]}) == []

    def test_enum_invalid(self):
        errs = Schema.validate_json_schema_value("c", {"type": "string", "enum": ["a", "b"]})
        assert len(errs) == 1
        assert "must be one of" in errs[0]

    def test_nullable_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": ["string", "null"]}) == []

    def test_nullable_keyword_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": "string", "nullable": True}) == []


class TestValidateInteger:
    def test_valid_integer(self):
        assert Schema.validate_json_schema_value(42, {"type": "integer"}) == []

    def test_wrong_type(self):
        errs = Schema.validate_json_schema_value("42", {"type": "integer"})
        assert len(errs) == 1

    def test_boolean_is_not_integer(self):
        errs = Schema.validate_json_schema_value(True, {"type": "integer"})
        assert len(errs) == 1

    def test_minimum_constraint(self):
        errs = Schema.validate_json_schema_value(5, {"type": "integer", "minimum": 10})
        assert len(errs) == 1

    def test_maximum_constraint(self):
        errs = Schema.validate_json_schema_value(15, {"type": "integer", "maximum": 10})
        assert len(errs) == 1

    def test_within_range(self):
        assert Schema.validate_json_schema_value(10, {"type": "integer", "minimum": 5, "maximum": 15}) == []

    def test_nullable_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": ["integer", "null"]}) == []


class TestValidateNumber:
    def test_valid_number_int(self):
        assert Schema.validate_json_schema_value(42, {"type": "number"}) == []

    def test_valid_number_float(self):
        assert Schema.validate_json_schema_value(3.14, {"type": "number"}) == []

    def test_wrong_type(self):
        errs = Schema.validate_json_schema_value("3.14", {"type": "number"})
        assert len(errs) == 1

    def test_boolean_is_not_number(self):
        errs = Schema.validate_json_schema_value(False, {"type": "number"})
        assert len(errs) == 1

    def test_minimum_constraint(self):
        errs = Schema.validate_json_schema_value(5.0, {"type": "number", "minimum": 10.0})
        assert len(errs) == 1

    def test_maximum_constraint(self):
        errs = Schema.validate_json_schema_value(15.0, {"type": "number", "maximum": 10.0})
        assert len(errs) == 1

    def test_nullable_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": ["number", "null"]}) == []


class TestValidateBoolean:
    def test_valid_boolean(self):
        assert Schema.validate_json_schema_value(True, {"type": "boolean"}) == []

    def test_wrong_type(self):
        errs = Schema.validate_json_schema_value(1, {"type": "boolean"})
        assert len(errs) == 1

    def test_nullable_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": ["boolean", "null"]}) == []


class TestValidateArray:
    def test_valid_array(self):
        assert Schema.validate_json_schema_value([1, 2], {"type": "array"}) == []

    def test_wrong_type(self):
        errs = Schema.validate_json_schema_value("not array", {"type": "array"})
        assert len(errs) == 1

    def test_min_items_constraint(self):
        errs = Schema.validate_json_schema_value([1], {"type": "array", "minItems": 2})
        assert len(errs) == 1

    def test_max_items_constraint(self):
        errs = Schema.validate_json_schema_value([1, 2, 3], {"type": "array", "maxItems": 2})
        assert len(errs) == 1

    def test_items_validation(self):
        errs = Schema.validate_json_schema_value(
            [42, "not int"],
            {"type": "array", "items": {"type": "integer"}},
        )
        assert len(errs) == 1
        assert "[1]" in errs[0]

    def test_nullable_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": ["array", "null"]}) == []


class TestValidateObject:
    def test_valid_object(self):
        assert Schema.validate_json_schema_value({"a": 1}, {"type": "object"}) == []

    def test_wrong_type(self):
        errs = Schema.validate_json_schema_value("not object", {"type": "object"})
        assert len(errs) == 1

    def test_missing_required(self):
        errs = Schema.validate_json_schema_value(
            {},
            {"type": "object", "properties": {"x": {"type": "integer"}}, "required": ["x"]},
        )
        assert len(errs) == 1
        assert "missing required" in errs[0]

    def test_required_present(self):
        assert Schema.validate_json_schema_value(
            {"x": 1},
            {"type": "object", "properties": {"x": {"type": "integer"}}, "required": ["x"]},
        ) == []

    def test_nested_property_validation(self):
        errs = Schema.validate_json_schema_value(
            {"inner": {"x": "not int"}},
            {"type": "object", "properties": {"inner": {"type": "object", "properties": {"x": {"type": "integer"}}}}},
        )
        assert len(errs) == 1
        assert "inner.x" in errs[0]

    def test_unknown_properties_ignored(self):
        assert Schema.validate_json_schema_value(
            {"x": 1, "y": "ignored"},
            {"type": "object", "properties": {"x": {"type": "integer"}}},
        ) == []

    def test_nullable_accepts_null(self):
        assert Schema.validate_json_schema_value(None, {"type": ["object", "null"]}) == []

    def test_with_label(self):
        errs = Schema.validate_json_schema_value(42, {"type": "string"}, "my_param")
        assert "my_param" in errs[0]


# ── Schema.fragment ──────────────────────────────────────────────────────

def test_fragment_from_schema_instance():
    s = type("MySchema", (), {"to_json_schema": lambda self: {"type": "string"}})()
    assert Schema.fragment(s) == {"type": "string"}


def test_fragment_from_dict():
    assert Schema.fragment({"type": "integer"}) == {"type": "integer"}


def test_fragment_invalid_raises():
    with pytest.raises(TypeError):
        Schema.fragment(42)


# ── Tool._cast_value ─────────────────────────────────────────────────────

class CastTool(Tool):
    name = "test"
    description = "test tool"
    parameters = {"type": "object", "properties": {}}

    async def execute(self, **kwargs):
        pass


class TestCastValue:
    def test_cast_string_from_int(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value(42, {"type": "string"})
        assert result == "42"

    def test_cast_string_from_string(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("hello", {"type": "string"})
        assert result == "hello"

    def test_cast_integer_from_string(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("42", {"type": "integer"})
        assert result == 42

    def test_cast_number_from_string(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("3.14", {"type": "number"})
        assert result == 3.14

    def test_cast_boolean_from_string_true(self):
        tool = CastTool.__new__(CastTool)
        assert tool._cast_value("true", {"type": "boolean"}) is True
        assert tool._cast_value("1", {"type": "boolean"}) is True
        assert tool._cast_value("yes", {"type": "boolean"}) is True

    def test_cast_boolean_from_string_false(self):
        tool = CastTool.__new__(CastTool)
        assert tool._cast_value("false", {"type": "boolean"}) is False
        assert tool._cast_value("0", {"type": "boolean"}) is False
        assert tool._cast_value("no", {"type": "boolean"}) is False

    def test_cast_boolean_from_bool_passthrough(self):
        tool = CastTool.__new__(CastTool)
        assert tool._cast_value(True, {"type": "boolean"}) is True

    def test_cast_integer_from_int_passthrough(self):
        tool = CastTool.__new__(CastTool)
        assert tool._cast_value(42, {"type": "integer"}) == 42

    def test_cast_invalid_number_returns_original(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("not_a_number", {"type": "number"})
        assert result == "not_a_number"

    def test_cast_array_with_items(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value(["1", "2"], {"type": "array", "items": {"type": "integer"}})
        assert result == [1, 2]

    def test_cast_array_without_items(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value(["a", "b"], {"type": "array"})
        assert result == ["a", "b"]

    def test_cast_object(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value(
            {"x": "42", "y": "ignored"},
            {"type": "object", "properties": {"x": {"type": "integer"}}},
        )
        assert result == {"x": 42, "y": "ignored"}

    def test_cast_non_string_for_string_type(self):
        tool = CastTool.__new__(CastTool)
        # _cast_value for string type returns None as-is (per the `val is None` guard)
        result = tool._cast_value(None, {"type": "string"})
        assert result is None

    def test_cast_non_dict_for_object(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("not_dict", {"type": "object"})
        assert result == "not_dict"

    def test_cast_non_list_for_array(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("not_list", {"type": "array"})
        assert result == "not_list"

    def test_cast_boolean_unknown_string_passthrough(self):
        tool = CastTool.__new__(CastTool)
        result = tool._cast_value("maybe", {"type": "boolean"})
        assert result == "maybe"


# ── Tool.cast_params ─────────────────────────────────────────────────────

def test_cast_params_non_object_schema_returns_unchanged():
    tool = CastTool.__new__(CastTool)
    params = {"a": "1"}
    result = tool.cast_params(params)
    assert result == params


# ── Tool.validate_params ─────────────────────────────────────────────────

def test_validate_params_non_dict():
    tool = CastTool.__new__(CastTool)
    errs = tool.validate_params("not dict")
    assert len(errs) == 1


def test_validate_params_valid():
    tool = type("T", (CastTool,), {
        "parameters": {"type": "object", "properties": {"x": {"type": "integer"}}}
    })()
    assert tool.validate_params({"x": 1}) == []


def test_validate_params_invalid():
    tool = type("T", (CastTool,), {
        "parameters": {"type": "object", "properties": {"x": {"type": "integer"}}}
    })()
    errs = tool.validate_params({"x": "not int"})
    assert len(errs) == 1


def test_validate_params_non_object_schema_raises():
    tool = type("T", (CastTool,), {
        "parameters": {"type": "string"}
    })()
    with pytest.raises(ValueError):
        tool.validate_params({"x": 1})


# ── Tool.to_schema ───────────────────────────────────────────────────────

def test_to_schema():
    tool = CastTool.__new__(CastTool)
    result = tool.to_schema()
    assert result["type"] == "function"
    assert result["function"]["name"] == "test"


# ── tool_parameters decorator ────────────────────────────────────────────

def test_tool_parameters_decorator_adds_property():
    @tool_parameters({
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    })
    class MyTool(Tool):
        name = "my_tool"
        description = "test"

        async def execute(self, **kwargs):
            pass

    tool = MyTool()
    assert tool.parameters == {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    }
    # Verify deepcopy independence
    assert tool.parameters is not tool.parameters


# ── Tool defaults ────────────────────────────────────────────────────────

def test_tool_defaults():
    tool = CastTool.__new__(CastTool)
    assert tool.read_only is False
    assert tool.concurrency_safe is False
    assert tool.exclusive is False
