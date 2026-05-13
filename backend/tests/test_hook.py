import pytest
from unittest.mock import MagicMock, AsyncMock
from app.agents.hook import AgentHookContext, AgentHook, CompositeHook


# ── AgentHookContext ─────────────────────────────────────────────────────

def test_hook_context_defaults():
    ctx = AgentHookContext(iteration=1, messages=[])
    assert ctx.iteration == 1
    assert ctx.messages == []
    assert ctx.response is None
    assert ctx.usage == {}
    assert ctx.tool_calls == []
    assert ctx.tool_results == []
    assert ctx.final_content is None
    assert ctx.stop_reason is None
    assert ctx.error is None


# ── AgentHook defaults ───────────────────────────────────────────────────

class TestAgentHookDefaults:
    def test_wants_streaming_defaults_false(self):
        hook = AgentHook()
        assert hook.wants_streaming() is False

    @pytest.mark.asyncio
    async def test_async_defaults_are_noops(self):
        hook = AgentHook()
        ctx = AgentHookContext(iteration=1, messages=[])
        await hook.before_iteration(ctx)
        await hook.on_stream(ctx, "delta")
        await hook.on_stream_end(ctx, resuming=False)
        await hook.before_execute_tools(ctx)
        await hook.after_iteration(ctx)

    def test_finalize_content_passthrough(self):
        hook = AgentHook()
        ctx = AgentHookContext(iteration=1, messages=[])
        assert hook.finalize_content(ctx, "hello") == "hello"
        assert hook.finalize_content(ctx, None) is None


# ── CompositeHook ────────────────────────────────────────────────────────

class TestCompositeHook:
    def test_wants_streaming_any_true(self):
        h1 = AgentHook()
        h2 = AgentHook()
        h2.wants_streaming = lambda: True
        composite = CompositeHook([h1, h2])
        assert composite.wants_streaming() is True

    def test_wants_streaming_all_false(self):
        h1 = AgentHook()
        h2 = AgentHook()
        composite = CompositeHook([h1, h2])
        assert composite.wants_streaming() is False

    @pytest.mark.asyncio
    async def test_before_iteration_fanout(self):
        h1, h2 = MagicMock(), MagicMock()
        h1._reraise = False
        h2._reraise = False
        h1.before_iteration = AsyncMock()
        h2.before_iteration = AsyncMock()
        composite = CompositeHook([h1, h2])
        ctx = AgentHookContext(iteration=1, messages=[])
        await composite.before_iteration(ctx)
        h1.before_iteration.assert_awaited_once()
        h2.before_iteration.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_before_iteration_isolates_errors(self):
        h1, h2 = MagicMock(), MagicMock()
        h1._reraise = False
        h2._reraise = False
        h1.before_iteration = AsyncMock(side_effect=RuntimeError("boom"))
        h2.before_iteration = AsyncMock()
        composite = CompositeHook([h1, h2])
        ctx = AgentHookContext(iteration=1, messages=[])
        await composite.before_iteration(ctx)  # should not raise
        h2.before_iteration.assert_awaited_once()  # h2 still runs

    @pytest.mark.asyncio
    async def test_reraises_when_flag_set(self):
        h1 = MagicMock()
        h1._reraise = True
        h1.before_iteration = AsyncMock(side_effect=RuntimeError("boom"))

        class BadHook(AgentHook):
            pass

        h2 = BadHook()
        composite = CompositeHook([h1, h2])
        ctx = AgentHookContext(iteration=1, messages=[])
        with pytest.raises(RuntimeError, match="boom"):
            await composite.before_iteration(ctx)

    def test_finalize_content_pipeline(self):
        def add_a(ctx, content):
            return (content or "") + "a"

        def add_b(ctx, content):
            return (content or "") + "b"

        h1 = AgentHook()
        h2 = AgentHook()
        h1.finalize_content = add_a
        h2.finalize_content = add_b

        composite = CompositeHook([h1, h2])
        ctx = AgentHookContext(iteration=1, messages=[])
        assert composite.finalize_content(ctx, "x") == "xab"

    def test_finalize_content_empty(self):
        composite = CompositeHook([])
        ctx = AgentHookContext(iteration=1, messages=[])
        assert composite.finalize_content(ctx, "hello") == "hello"
