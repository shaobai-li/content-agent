from pathlib import Path
from unittest.mock import patch
import pytest
from app.agents.context import ContextBuilder


def _kb_empty():
    return patch("app.service.knowledge_base_registry_service.list_knowledge_bases", return_value=[])


# ── _current_datetime ──────────────────────────────────────────────────────

def test_current_datetime_format():
    result = ContextBuilder._current_datetime()
    assert "当前本地时间" in result
    assert "20" in result  # year


# ── _merge_message_content ─────────────────────────────────────────────────

def test_merge_two_strings():
    assert ContextBuilder._merge_message_content("hello", "world") == "hello\n\nworld"


def test_merge_left_empty_string():
    assert ContextBuilder._merge_message_content("", "world") == "world"


def test_merge_both_lists():
    result = ContextBuilder._merge_message_content(
        [{"type": "text", "text": "a"}], [{"type": "text", "text": "b"}])
    assert len(result) == 2


def test_merge_str_and_list():
    result = ContextBuilder._merge_message_content("str", [{"type": "text", "text": "block"}])
    assert result[0] == {"type": "text", "text": "str"}


# ── ContextBuilder.__init__ ─────────────────────────────────────────────────

def test_context_builder_init(tmp_path):
    cb = ContextBuilder(tmp_path)
    assert cb.workspace == tmp_path
    assert cb.agent_id is None


def test_context_builder_init_with_agent(tmp_path):
    cb = ContextBuilder(tmp_path, agent_id="test_agent")
    assert cb.agent_id == "test_agent"


# ── _resolve_base_prompt / resolve_base_prompt ─────────────────────────────

def test_resolve_base_prompt_builtin(tmp_path):
    cb = ContextBuilder(tmp_path)
    with patch.object(Path, "read_text", return_value="built-in system prompt"):
        assert cb._resolve_base_prompt() == "built-in system prompt"


def test_resolve_base_prompt_user_override(tmp_path):
    cb = ContextBuilder(tmp_path, agent_id="ag")
    user_prompt = tmp_path / "prompts" / "system_prompt.md"
    user_prompt.parent.mkdir(parents=True, exist_ok=True)
    user_prompt.write_text("user override prompt")
    with patch("app.agents.context.get_agent_base_dir", return_value=tmp_path):
        assert cb._resolve_base_prompt() == "user override prompt"


def test_resolve_base_prompt_public_alias(tmp_path):
    cb = ContextBuilder(tmp_path)
    with patch.object(Path, "read_text", return_value="base"):
        assert cb.resolve_base_prompt() == cb._resolve_base_prompt()


# ── build_system_prompt ─────────────────────────────────────────────────────

def test_build_system_prompt_minimal(tmp_path):
    cb = ContextBuilder(tmp_path)
    with patch.object(cb, "_resolve_base_prompt", return_value="base"), _kb_empty():
        prompt = cb.build_system_prompt()
        assert "当前本地时间" in prompt
        assert "AGENT_WORKSPACE" in prompt


def test_build_system_prompt_with_skills_xml(tmp_path):
    cb = ContextBuilder(tmp_path, agent_id="ag")
    with patch("app.agents.context.discover_skills_xml_for_agent",
               return_value="<skills><skill id='s1'/></skills>"), \
         patch.object(cb, "_resolve_base_prompt", return_value="base"), \
         patch("app.agents.context.get_agent_base_dir", return_value=tmp_path), \
         _kb_empty():
        prompt = cb.build_system_prompt()
        assert "<skills>" in prompt


def test_build_system_prompt_with_bootstrap(tmp_path):
    cb = ContextBuilder(tmp_path)
    (tmp_path / "AGENTS.md").write_text("bootstrap content")
    with patch.object(cb, "_resolve_base_prompt", return_value="base"), _kb_empty():
        prompt = cb.build_system_prompt()
        assert "AGENTS.md" in prompt
        assert "bootstrap content" in prompt


def test_build_system_prompt_empty_head_with_guard(tmp_path):
    cb = ContextBuilder(tmp_path)
    with patch.object(cb, "_resolve_base_prompt", return_value=""), _kb_empty():
        prompt = cb.build_system_prompt()
        assert "AGENT_WORKSPACE" in prompt


# ── build_messages ──────────────────────────────────────────────────────────

def test_build_messages_no_history_no_mentions(tmp_path):
    cb = ContextBuilder(tmp_path)
    with patch.object(cb, "_resolve_base_prompt", return_value="sys"), _kb_empty():
        msgs = cb.build_messages([], "hello")
        assert msgs[0]["role"] == "system"
        assert msgs[-1]["role"] == "user"
        assert msgs[-1]["content"] == "hello"


def test_build_messages_with_history(tmp_path):
    cb = ContextBuilder(tmp_path)
    history = [{"role": "user", "content": "past"}]
    with patch.object(cb, "_resolve_base_prompt", return_value="sys"), _kb_empty():
        msgs = cb.build_messages(history, "current")
        assert msgs[1] == history[0]
        assert msgs[-1]["content"] == "current"


def test_build_messages_with_mentions(tmp_path):
    cb = ContextBuilder(tmp_path)
    ref_file = tmp_path / "ref.md"
    ref_file.write_text("article body")
    mentions = [{"name": "doc1", "parsed_path": str(ref_file)}]
    with patch.object(cb, "_resolve_base_prompt", return_value="sys"), _kb_empty():
        msgs = cb.build_messages([], "hi", mentions=mentions)
        assert any("参考文章: doc1" in str(m.get("content", "")) for m in msgs)


def test_build_messages_mention_merges_with_same_role(tmp_path):
    cb = ContextBuilder(tmp_path)
    ref_file = tmp_path / "ref.md"
    ref_file.write_text("article body")
    mentions = [{"name": "doc1", "parsed_path": str(ref_file)}]
    history = [{"role": "user", "content": "history text"}]
    with patch.object(cb, "_resolve_base_prompt", return_value="sys"), _kb_empty():
        msgs = cb.build_messages(history, "hi", mentions=mentions)
        assert len(msgs) >= 3


def test_build_messages_empty_current_message(tmp_path):
    cb = ContextBuilder(tmp_path)
    with patch.object(cb, "_resolve_base_prompt", return_value="sys"), _kb_empty():
        msgs = cb.build_messages([], "")
        assert msgs[0]["role"] == "system"
