import pytest
from pathlib import Path
from unittest.mock import patch
from app.utils.skill_loader import (
    _xml_text,
    SkillHead,
    parse_skill_frontmatter,
    read_skill_head,
    load_skill_body,
    load_skill,
    discover_skills_for_agent,
    discover_skills_xml_for_agent,
    format_skills_discovery_xml,
    format_skill_catalog_lines,
    prepend_skill_catalog_xml_to_system_prompt,
)


# ── _xml_text ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("a & b", "a &amp; b"),
        ("<tag>", "&lt;tag&gt;"),
        ("hello", "hello"),
        ("", ""),
    ],
)
def test_xml_text(text, expected):
    assert _xml_text(text) == expected


# ── parse_skill_frontmatter ──────────────────────────────────────────────

def test_parse_skill_frontmatter_valid():
    yaml_content = "---\nname: Test Skill\ndescription: A test\n---\n# Body"
    with patch("pathlib.Path.read_text", return_value=yaml_content):
        result = parse_skill_frontmatter(Path("/fake/SKILL.md"))
        assert result == {"name": "Test Skill", "description": "A test"}


def test_parse_skill_frontmatter_no_yaml_header():
    with patch("pathlib.Path.read_text", return_value="# No YAML header"):
        result = parse_skill_frontmatter(Path("/fake/SKILL.md"))
        assert result is None


@pytest.mark.xfail(reason="BUG: parse_skill_frontmatter does not catch YAML ParserError for malformed input")
def test_parse_skill_frontmatter_malformed():
    yaml_content = "---\n{invalid: yaml: format\n---\n# Body"
    with patch("pathlib.Path.read_text", return_value=yaml_content):
        result = parse_skill_frontmatter(Path("/fake/SKILL.md"))
        assert result is None


def test_parse_skill_frontmatter_non_dict():
    yaml_content = "---\n- list item\n---\n# Body"
    with patch("pathlib.Path.read_text", return_value=yaml_content):
        result = parse_skill_frontmatter(Path("/fake/SKILL.md"))
        assert result is None


# ── read_skill_head ──────────────────────────────────────────────────────

def test_read_skill_head_valid():
    meta = {"name": "My Skill", "description": "Does things"}
    with patch("app.utils.skill_loader.parse_skill_frontmatter", return_value=meta):
        result = read_skill_head("skill1", Path("/fake/SKILL.md"), "bundled")
        assert result is not None
        assert result.skill_id == "skill1"
        assert result.source == "bundled"
        assert result.name == "My Skill"
        assert result.description == "Does things"


def test_read_skill_head_missing_name():
    meta = {"description": "No name"}
    with patch("app.utils.skill_loader.parse_skill_frontmatter", return_value=meta):
        result = read_skill_head("skill1", Path("/fake/SKILL.md"), "bundled")
        assert result is None


def test_read_skill_head_missing_description():
    meta = {"name": "No desc"}
    with patch("app.utils.skill_loader.parse_skill_frontmatter", return_value=meta):
        result = read_skill_head("skill1", Path("/fake/SKILL.md"), "bundled")
        assert result is None


def test_read_skill_head_empty_name():
    meta = {"name": "  ", "description": "desc"}
    with patch("app.utils.skill_loader.parse_skill_frontmatter", return_value=meta):
        result = read_skill_head("skill1", Path("/fake/SKILL.md"), "bundled")
        assert result is None


def test_read_skill_head_no_meta():
    with patch("app.utils.skill_loader.parse_skill_frontmatter", return_value=None):
        result = read_skill_head("skill1", Path("/fake/SKILL.md"), "bundled")
        assert result is None


def test_read_skill_head_empty_description():
    meta = {"name": "Skill", "description": "  "}
    with patch("app.utils.skill_loader.parse_skill_frontmatter", return_value=meta):
        result = read_skill_head("skill1", Path("/fake/SKILL.md"), "bundled")
        assert result is None


# ── load_skill_body ──────────────────────────────────────────────────────

def test_load_skill_body_with_frontmatter():
    content = "---\nname: Test\ndescription: Desc\n---\n## Instructions\nDo X."
    with patch("pathlib.Path.read_text", return_value=content):
        result = load_skill_body(Path("/fake/skills"), "skill1")
        assert result == "## Instructions\nDo X."


def test_load_skill_body_without_frontmatter():
    content = "## Plain body"
    with patch("pathlib.Path.read_text", return_value=content):
        result = load_skill_body(Path("/fake/skills"), "skill1")
        assert result == "## Plain body"


# ── load_skill (compat) ──────────────────────────────────────────────────

def test_load_skill_compat():
    content = "---\nkey: val\n---\nBody text"
    with patch("pathlib.Path.read_text", return_value=content):
        result = load_skill(Path("/fake/skills"), "skill1")
        assert result == "Body text"


# ── format_skills_discovery_xml ──────────────────────────────────────────

def test_format_skills_discovery_xml_empty():
    assert format_skills_discovery_xml([]) == ""


def test_format_skills_discovery_xml_single():
    heads = [SkillHead("sk1", "bundled", "My Skill", "Does things", Path("/fake/SKILL.md"))]
    result = format_skills_discovery_xml(heads)
    assert "<skills>" in result
    assert 'id="sk1"' in result
    assert 'source="bundled"' in result
    assert "<name>My Skill</name>" in result
    assert "<description>Does things</description>" in result
    assert "</skills>" in result


def test_format_skills_discovery_xml_multiple():
    heads = [
        SkillHead("sk1", "bundled", "Skill 1", "First", Path("/a/SKILL.md")),
        SkillHead("sk2", "user", "Skill 2", "Second", Path("/b/SKILL.md")),
    ]
    result = format_skills_discovery_xml(heads)
    assert result.count("<skill ") == 2
    assert 'id="sk1"' in result
    assert 'id="sk2"' in result


def test_format_skills_discovery_xml_escapes_special_chars():
    heads = [SkillHead("sk&1", "bundled", "A < B", "C & D", Path("/fake/SKILL.md"))]
    result = format_skills_discovery_xml(heads)
    assert "&amp;" in result
    assert "&lt;" in result


# ── format_skill_catalog_lines ───────────────────────────────────────────

def test_format_skill_catalog_lines_empty():
    assert format_skill_catalog_lines([]) == ""


def test_format_skill_catalog_lines_single():
    heads = [SkillHead("sk1", "bundled", "My Skill", "Does things", Path("/fake"))]
    result = format_skill_catalog_lines(heads)
    assert "[bundled] sk1" in result
    assert "My Skill: Does things" in result


def test_format_skill_catalog_lines_multiple():
    heads = [
        SkillHead("a", "bundled", "A", "First", Path("/a")),
        SkillHead("b", "user", "B", "Second", Path("/b")),
    ]
    result = format_skill_catalog_lines(heads)
    lines = result.split("\n")
    assert len(lines) == 2


# ── prepend_skill_catalog_xml_to_system_prompt ───────────────────────────

def test_prepend_skill_catalog_no_skills():
    with patch("app.utils.skill_loader.discover_skills_xml_for_agent", return_value=""):
        result = prepend_skill_catalog_xml_to_system_prompt("system prompt", "agent1")
        assert result == "system prompt"


def test_prepend_skill_catalog_no_base_prompt():
    with patch("app.utils.skill_loader.discover_skills_xml_for_agent", return_value="<skills/>"):
        result = prepend_skill_catalog_xml_to_system_prompt("", "agent1")
        assert result == "<skills/>"


def test_prepend_skill_catalog_both_present():
    with patch("app.utils.skill_loader.discover_skills_xml_for_agent", return_value="<skills/>"):
        result = prepend_skill_catalog_xml_to_system_prompt("system prompt", "agent1")
        assert result == "<skills/>\n\nsystem prompt"


def test_prepend_skill_catalog_none_base():
    with patch("app.utils.skill_loader.discover_skills_xml_for_agent", return_value="<skills/>"):
        result = prepend_skill_catalog_xml_to_system_prompt(None, "agent1")
        assert result == "<skills/>"


# ── discover_skills_for_agent ────────────────────────────────────────────

def test_discover_skills_empty():
    with patch("app.utils.skill_loader.get_agent_skill_ids", return_value=[]):
        with patch("app.utils.skill_loader.get_agent_base_dir", return_value=Path("/fake")):
            with patch.object(Path, "is_dir", return_value=False):
                result = discover_skills_for_agent("agent1")
                assert result == []


def test_discover_skills_from_bundled():
    fake_head = SkillHead("sk1", "bundled", "Skill 1", "Desc", Path("/fake/SKILL.md"))
    with patch("app.utils.skill_loader.get_agent_skill_ids", return_value=["sk1"]):
        with patch("app.utils.skill_loader.bundled_skills_dir", return_value=Path("/fake/bundled")):
            with patch.object(Path, "is_file", return_value=True):
                with patch("app.utils.skill_loader.read_skill_head", return_value=fake_head):
                    with patch("app.utils.skill_loader.get_agent_base_dir", return_value=Path("/fake/agent")):
                        with patch.object(Path, "is_dir", return_value=False):
                            result = discover_skills_for_agent("agent1")
                            assert len(result) == 1
                            assert result[0].skill_id == "sk1"


def test_discover_skills_skips_missing_in_bundled():
    with patch("app.utils.skill_loader.get_agent_skill_ids", return_value=["missing_skill"]):
        with patch("app.utils.skill_loader.bundled_skills_dir", return_value=Path("/fake/bundled")):
            with patch.object(Path, "is_file", return_value=False):
                with patch("app.utils.skill_loader.get_agent_base_dir", return_value=Path("/fake/agent")):
                    with patch.object(Path, "is_dir", return_value=False):
                        result = discover_skills_for_agent("agent1")
                        assert result == []


def test_discover_skills_user_override():
    fake_head = SkillHead("sk1", "bundled", "Skill 1", "Desc", Path("/fake/SKILL.md"))
    with patch("app.utils.skill_loader.get_agent_skill_ids", return_value=["sk1"]):
        with patch("app.utils.skill_loader.bundled_skills_dir", return_value=Path("/fake/bundled")):
            with patch.object(Path, "is_file", return_value=True):
                with patch("app.utils.skill_loader.read_skill_head", return_value=fake_head):
                    with patch("app.utils.skill_loader.get_agent_base_dir", return_value=Path("/fake/agent")):
                        with patch.object(Path, "is_dir", side_effect=[True, True]):
                            with patch.object(Path, "iterdir", return_value=[Path("/fake/agent/skills/sk1")]):
                                result = discover_skills_for_agent("agent1")
                                assert len(result) >= 1


def test_discover_skills_user_without_ordered():
    """User-only skills appended alphabetically after ordered bundled skills."""
    fake_head_a = SkillHead("ua", "user", "User A", "Desc A", Path("/fake/ua"))
    fake_head_b = SkillHead("ub", "user", "User B", "Desc B", Path("/fake/ub"))

    def mock_read_head(skill_id, path, source):
        if skill_id == "ua":
            return fake_head_a
        if skill_id == "ub":
            return fake_head_b
        return None

    fake_dir = Path("/fake/agent/skills")
    with patch("app.utils.skill_loader.get_agent_skill_ids", return_value=[]):
        with patch("app.utils.skill_loader.get_agent_base_dir", return_value=fake_dir):
            with patch.object(Path, "is_dir", return_value=True):
                with patch.object(Path, "iterdir", return_value=[
                    Path("/fake/agent/skills/ub"),
                    Path("/fake/agent/skills/ua"),
                ]):
                    with patch.object(Path, "is_file", return_value=True):
                        with patch("app.utils.skill_loader.read_skill_head", side_effect=mock_read_head):
                            result = discover_skills_for_agent("agent1")
                            # Should be sorted alphabetically: ua, ub
                            assert len(result) == 2
                            assert result[0].skill_id == "ua"
                            assert result[1].skill_id == "ub"


def test_discover_skills_xml_for_agent_empty():
    with patch("app.utils.skill_loader.discover_skills_for_agent", return_value=[]):
        result = discover_skills_xml_for_agent("agent1")
        assert result == ""


def test_discover_skills_xml_for_agent_with_skills():
    head = SkillHead("sk1", "bundled", "S", "D", Path("/fake/SKILL.md"))
    with patch("app.utils.skill_loader.discover_skills_for_agent", return_value=[head]):
        result = discover_skills_xml_for_agent("agent1")
        assert "<skills>" in result
        assert 'id="sk1"' in result
