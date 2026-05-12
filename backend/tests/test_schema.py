import pytest
from app.agents.tools.schema import (
    StringSchema,
    IntegerSchema,
    NumberSchema,
    BooleanSchema,
    ArraySchema,
    ObjectSchema,
    tool_parameters_schema,
)


# ── StringSchema ─────────────────────────────────────────────────────────

def test_string_schema_basic():
    s = StringSchema("a string param")
    result = s.to_json_schema()
    assert result == {"type": "string", "description": "a string param"}


def test_string_schema_no_description():
    s = StringSchema()
    result = s.to_json_schema()
    assert result == {"type": "string"}


def test_string_schema_with_min_max_length():
    s = StringSchema("desc", min_length=1, max_length=100)
    result = s.to_json_schema()
    assert result["minLength"] == 1
    assert result["maxLength"] == 100


@pytest.mark.parametrize(
    ("enum", "expected"),
    [
        (["a", "b", "c"], ["a", "b", "c"]),
        (("a", "b"), ["a", "b"]),
    ],
)
def test_string_schema_with_enum(enum, expected):
    s = StringSchema("choices", enum=enum)
    result = s.to_json_schema()
    assert result["enum"] == expected


def test_string_schema_nullable():
    s = StringSchema("nullable str", nullable=True)
    result = s.to_json_schema()
    assert result["type"] == ["string", "null"]


# ── IntegerSchema ────────────────────────────────────────────────────────

def test_integer_schema_basic():
    s = IntegerSchema(5, description="an integer")
    result = s.to_json_schema()
    assert result == {"type": "integer", "description": "an integer"}


def test_integer_schema_no_description():
    s = IntegerSchema(0)
    result = s.to_json_schema()
    assert result == {"type": "integer"}


def test_integer_schema_with_min_max():
    s = IntegerSchema(0, minimum=0, maximum=100)
    result = s.to_json_schema()
    assert result["minimum"] == 0
    assert result["maximum"] == 100


def test_integer_schema_with_enum():
    s = IntegerSchema(0, enum=[1, 2, 3])
    result = s.to_json_schema()
    assert result["enum"] == [1, 2, 3]


def test_integer_schema_nullable():
    s = IntegerSchema(0, nullable=True)
    result = s.to_json_schema()
    assert result["type"] == ["integer", "null"]


# ── NumberSchema ─────────────────────────────────────────────────────────

def test_number_schema_basic():
    s = NumberSchema(3.14, description="a float")
    result = s.to_json_schema()
    assert result == {"type": "number", "description": "a float"}


def test_number_schema_no_description():
    s = NumberSchema(0.0)
    result = s.to_json_schema()
    assert result == {"type": "number"}


def test_number_schema_with_min_max():
    s = NumberSchema(0.0, minimum=0.0, maximum=1.0)
    result = s.to_json_schema()
    assert result["minimum"] == 0.0
    assert result["maximum"] == 1.0


def test_number_schema_with_enum():
    s = NumberSchema(0.0, enum=[1.0, 2.0])
    result = s.to_json_schema()
    assert result["enum"] == [1.0, 2.0]


def test_number_schema_nullable():
    s = NumberSchema(0.0, nullable=True)
    result = s.to_json_schema()
    assert result["type"] == ["number", "null"]


# ── BooleanSchema ────────────────────────────────────────────────────────

def test_boolean_schema_basic():
    s = BooleanSchema(description="a flag")
    result = s.to_json_schema()
    assert result == {"type": "boolean", "description": "a flag"}


def test_boolean_schema_no_description():
    s = BooleanSchema()
    result = s.to_json_schema()
    assert result == {"type": "boolean"}


def test_boolean_schema_with_default():
    s = BooleanSchema(default=True)
    result = s.to_json_schema()
    assert result["default"] is True


def test_boolean_schema_default_none_not_included():
    s = BooleanSchema(default=None)
    result = s.to_json_schema()
    assert "default" not in result


def test_boolean_schema_nullable():
    s = BooleanSchema(nullable=True)
    result = s.to_json_schema()
    assert result["type"] == ["boolean", "null"]


# ── ArraySchema ──────────────────────────────────────────────────────────

def test_array_schema_basic():
    s = ArraySchema(description="list of strings")
    result = s.to_json_schema()
    assert result["type"] == "array"
    assert result["description"] == "list of strings"
    assert "items" in result


def test_array_schema_no_items_defaults_to_string():
    s = ArraySchema()
    result = s.to_json_schema()
    assert result["items"]["type"] == "string"


def test_array_schema_with_custom_items():
    s = ArraySchema(items=IntegerSchema(0))
    result = s.to_json_schema()
    assert result["items"]["type"] == "integer"


def test_array_schema_with_min_max_items():
    s = ArraySchema(min_items=1, max_items=10)
    result = s.to_json_schema()
    assert result["minItems"] == 1
    assert result["maxItems"] == 10


def test_array_schema_nullable():
    s = ArraySchema(nullable=True)
    result = s.to_json_schema()
    assert result["type"] == ["array", "null"]


# ── ObjectSchema ─────────────────────────────────────────────────────────

def test_object_schema_basic():
    s = ObjectSchema(description="an object")
    result = s.to_json_schema()
    assert result["type"] == "object"
    assert result["description"] == "an object"
    assert result["properties"] == {}


def test_object_schema_with_properties():
    s = ObjectSchema(
        properties={"name": StringSchema("the name"), "age": IntegerSchema(0)},
        required=["name"],
        description="person",
    )
    result = s.to_json_schema()
    assert result["type"] == "object"
    assert "name" in result["properties"]
    assert "age" in result["properties"]
    assert result["required"] == ["name"]
    assert result["description"] == "person"


def test_object_schema_kwargs_as_properties():
    s = ObjectSchema(name=StringSchema("the name"), age=IntegerSchema(0))
    result = s.to_json_schema()
    assert "name" in result["properties"]
    assert "age" in result["properties"]


def test_object_schema_with_additional_properties():
    s = ObjectSchema(additional_properties=False)
    result = s.to_json_schema()
    assert result["additionalProperties"] is False


def test_object_schema_additional_properties_none_not_included():
    s = ObjectSchema()
    result = s.to_json_schema()
    assert "additionalProperties" not in result


def test_object_schema_nullable():
    s = ObjectSchema(nullable=True)
    result = s.to_json_schema()
    assert result["type"] == ["object", "null"]


def test_object_schema_with_additional_properties_dict():
    s = ObjectSchema(additional_properties={"type": "string"})
    result = s.to_json_schema()
    assert result["additionalProperties"] == {"type": "string"}


# ── tool_parameters_schema ───────────────────────────────────────────────

def test_tool_parameters_schema_basic():
    result = tool_parameters_schema(
        required=["path"],
        description="params",
        path=StringSchema("file path"),
    )
    assert result["type"] == "object"
    assert result["description"] == "params"
    assert result["required"] == ["path"]
    assert "path" in result["properties"]


def test_tool_parameters_schema_no_required():
    result = tool_parameters_schema(key=StringSchema("a key"))
    assert result["type"] == "object"
    assert "required" not in result
