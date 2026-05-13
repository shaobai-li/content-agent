import pytest
from unittest.mock import MagicMock, AsyncMock
from app.agents.tools.registry import ToolRegistry
from app.agents.tools.base import Tool


def _make_tool(name, params=None):
    tool = MagicMock(spec=Tool)
    tool.name = name
    tool.description = f"Tool {name}"
    tool.parameters = params or {"type": "object", "properties": {}, "required": []}
    tool.to_schema.return_value = {
        "type": "function",
        "function": {
            "name": name,
            "description": f"Tool {name}",
            "parameters": tool.parameters,
        },
    }
    tool.cast_params.side_effect = lambda p: p
    tool.validate_params.return_value = []
    tool.execute = AsyncMock(return_value="result")
    return tool


class TestToolRegistry:
    def test_register_adds_tool(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        assert "t1" in reg
        assert len(reg) == 1

    def test_register_invalidates_cache(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        defs1 = reg.get_definitions()
        reg.register(_make_tool("t2"))
        defs2 = reg.get_definitions()
        assert len(defs1) == 1
        assert len(defs2) == 2

    def test_unregister_removes_tool(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        reg.unregister("t1")
        assert "t1" not in reg
        assert len(reg) == 0

    def test_get_returns_tool(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        reg.register(tool)
        assert reg.get("t1") is tool

    def test_get_nonexistent_returns_none(self):
        reg = ToolRegistry()
        assert reg.get("nonexistent") is None

    def test_has_returns_true_for_registered(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        assert reg.has("t1") is True

    def test_has_returns_false_for_unregistered(self):
        reg = ToolRegistry()
        assert reg.has("t1") is False

    def test_get_definitions_returns_sorted(self):
        reg = ToolRegistry()
        reg.register(_make_tool("b_tool"))
        reg.register(_make_tool("a_tool"))
        defs = reg.get_definitions()
        names = [d["function"]["name"] for d in defs]
        assert names == ["a_tool", "b_tool"]

    def test_get_definitions_caches_result(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        defs1 = reg.get_definitions()
        defs2 = reg.get_definitions()
        assert defs1 is defs2

    def test_tool_names_returns_names(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        reg.register(_make_tool("t2"))
        assert reg.tool_names == ["t1", "t2"]

    def test_schema_name_falls_back_to_top_level_name(self):
        # Directly test the static method
        name = ToolRegistry._schema_name({"name": "top"})
        assert name == "top"

    def test_schema_name_missing_everywhere_returns_empty(self):
        name = ToolRegistry._schema_name({})
        assert name == ""

    def test_prepare_call_valid_tool(self):
        reg = ToolRegistry()
        tool = _make_tool("t1", {"type": "object", "properties": {"x": {"type": "integer"}}})
        reg.register(tool)
        resolved, params, error = reg.prepare_call("t1", {"x": 1})
        assert resolved is tool
        assert error is None

    def test_prepare_call_unknown_tool(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        _, _, error = reg.prepare_call("unknown", {})
        assert error is not None
        assert "not found" in error

    def test_prepare_call_validation_error(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        tool.validate_params.return_value = ["param x required"]
        reg.register(tool)
        _, _, error = reg.prepare_call("t1", {})
        assert error is not None
        assert "param x required" in error

    def test_prepare_call_casts_params(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        tool.cast_params.side_effect = lambda p: {**p, "cast": True}
        reg.register(tool)
        _, params, _ = reg.prepare_call("t1", {"x": "5"})
        assert params["cast"] is True

    @pytest.mark.asyncio
    async def test_execute_calls_tool(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        tool.execute = AsyncMock(return_value="done")
        reg.register(tool)
        result = await reg.execute("t1", {})
        assert result == "done"

    @pytest.mark.asyncio
    async def test_execute_unknown_tool_returns_error(self):
        reg = ToolRegistry()
        reg.register(_make_tool("t1"))
        result = await reg.execute("unknown", {})
        assert result.startswith("Error")

    @pytest.mark.asyncio
    async def test_execute_validation_error_returns_error(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        tool.validate_params.return_value = ["bad param"]
        reg.register(tool)
        result = await reg.execute("t1", {})
        assert result.startswith("Error")

    @pytest.mark.asyncio
    async def test_execute_exception_returns_error(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        tool.execute.side_effect = RuntimeError("boom")
        reg.register(tool)
        result = await reg.execute("t1", {})
        assert "Error executing t1" in result

    @pytest.mark.asyncio
    async def test_execute_result_starting_with_error_gets_hint(self):
        reg = ToolRegistry()
        tool = _make_tool("t1")
        tool.execute = AsyncMock(return_value="Error: something went wrong")
        reg.register(tool)
        result = await reg.execute("t1", {})
        assert result.startswith("Error")
        assert "[Analyze the error" in result
