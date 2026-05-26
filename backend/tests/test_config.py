from pathlib import Path
from unittest.mock import patch, mock_open
import pytest
from app.core.config import (
    get_agent_config,
    get_agent_base_dir,
    get_agent_workspace_dir,
    get_agent_local_data_dir,
    get_agent_attachment_cache_dir,
    get_agent_sessions_path,
    get_agent_messages_path,
    get_agent_knowledge_base_path,
    get_agent_skill_ids,
    _load_agent_yamls,
)


# ── _load_agent_yamls ──────────────────────────────────────────────────────

def test_load_agent_yamls_empty_dir():
    with patch.object(Path, "is_dir", return_value=False):
        result = _load_agent_yamls()
        assert result == {}


def test_load_agent_yamls_loads_yaml_files():
    yaml_content = "base_dir: test_agent\nsystem_prompt: hello"
    fake_yaml = {"base_dir": "test_agent", "system_prompt": "hello"}
    with patch.object(Path, "is_dir", return_value=True), \
         patch.object(Path, "glob", return_value=[Path("config/agents/std.yaml")]), \
         patch("app.core.config.yaml.safe_load", return_value=fake_yaml), \
         patch("builtins.open", mock_open(read_data=yaml_content)):
        result = _load_agent_yamls()
        assert "std" in result
        assert result["std"]["base_dir"] == "test_agent"


def test_load_agent_yamls_skips_non_dict():
    with patch.object(Path, "is_dir", return_value=True), \
         patch.object(Path, "glob", return_value=[Path("config/agents/bad.yaml")]), \
         patch("app.core.config.yaml.safe_load", return_value=["not", "a", "dict"]), \
         patch("builtins.open", mock_open()):
        result = _load_agent_yamls()
        assert "bad" not in result


def test_load_agent_yamls_strips_agent_id_key():
    fake_yaml = {"agent_id": "should_be_ignored", "base_dir": "test"}
    with patch.object(Path, "is_dir", return_value=True), \
         patch.object(Path, "glob", return_value=[Path("config/agents/std.yaml")]), \
         patch("app.core.config.yaml.safe_load", return_value=fake_yaml), \
         patch("builtins.open", mock_open()):
        result = _load_agent_yamls()
        assert result["std"] == {"base_dir": "test"}


# ── get_agent_config ───────────────────────────────────────────────────────

def test_get_agent_config_raises_for_missing():
    with pytest.raises(ValueError, match="配置不存在"):
        get_agent_config("nonexistent_agent_xyz")

# Already-covered path via AGENTS_CONFIG populated in conftest/dotenv — tested
# indirectly through path functions below.

# ── get_agent_base_dir ─────────────────────────────────────────────────────

def test_get_agent_base_dir(tmp_path):
    with patch("app.core.config.DATA_DIR", tmp_path), \
         patch("app.core.auth.get_current_user_id", return_value="1"):
        result = get_agent_base_dir("ag")
    assert result == (tmp_path / "u_1" / "data" / "ag").resolve()

# ── get_agent_workspace_dir ────────────────────────────────────────────────

@patch.object(Path, "mkdir")
@patch("app.core.config.get_agent_base_dir")
def test_get_agent_workspace_dir(mock_base_dir, mock_mkdir, tmp_path):
    mock_base_dir.return_value = tmp_path
    result = get_agent_workspace_dir("ag")
    assert result.name == ".local"
    assert result.parent == tmp_path


# ── get_agent_local_data_dir ───────────────────────────────────────────────

@patch.object(Path, "mkdir")
@patch("app.core.config.get_agent_base_dir")
def test_get_agent_local_data_dir(mock_base_dir, mock_mkdir, tmp_path):
    mock_base_dir.return_value = tmp_path
    result = get_agent_local_data_dir("ag")
    assert result.name == "knowledge_base"
    assert result.parent == tmp_path


# ── get_agent_attachment_cache_dir ─────────────────────────────────────────

@patch.object(Path, "mkdir")
@patch("app.core.config.get_agent_workspace_dir")
def test_get_agent_attachment_cache_dir(mock_ws, mock_mkdir, tmp_path):
    mock_ws.return_value = tmp_path
    result = get_agent_attachment_cache_dir("ag")
    assert result.name == "cache"
    assert result.parent == tmp_path


# ── get_agent_sessions_path ────────────────────────────────────────────────

@patch("app.core.config.get_agent_workspace_dir")
def test_get_agent_sessions_path(mock_ws, tmp_path):
    mock_ws.return_value = tmp_path
    result = get_agent_sessions_path("ag")
    assert result == tmp_path / "sessions.json"



# ── get_agent_messages_path ────────────────────────────────────────────────

@patch("app.core.config.get_agent_workspace_dir")
def test_get_agent_messages_path(mock_ws, tmp_path):
    mock_ws.return_value = tmp_path
    result = get_agent_messages_path("ag")
    assert result == tmp_path / "messages.json"


# ── get_agent_knowledge_base_path ──────────────────────────────────────────

def test_get_agent_knowledge_base_path_delegates(tmp_path):
    # get_database_nodes_path is imported locally inside the function
    with patch("app.service.knowledge_base_registry_service.get_database_nodes_path", return_value=tmp_path / "nodes.json") as mock:
        result = get_agent_knowledge_base_path("ag", "kb1")
        mock.assert_called_once_with("ag", "kb1")
        assert result == tmp_path / "nodes.json"


# ── get_agent_skill_ids ────────────────────────────────────────────────────

def test_get_agent_skill_ids_valid():
    import app.core.config as m
    original = dict(m.AGENTS_CONFIG)
    try:
        m.AGENTS_CONFIG = {"test_ag": {"skills": ["skill_a", "skill_b"]}}
        result = get_agent_skill_ids("test_ag")
        assert result == ["skill_a", "skill_b"]
    finally:
        m.AGENTS_CONFIG = original


def test_get_agent_skill_ids_missing_agent():
    import app.core.config as m
    original = dict(m.AGENTS_CONFIG)
    try:
        m.AGENTS_CONFIG = {}
        result = get_agent_skill_ids("nonexistent")
        assert result == []
    finally:
        m.AGENTS_CONFIG = original


def test_get_agent_skill_ids_non_list():
    import app.core.config as m
    original = dict(m.AGENTS_CONFIG)
    try:
        m.AGENTS_CONFIG = {"test_ag": {"skills": "not_a_list"}}
        result = get_agent_skill_ids("test_ag")
        assert result == []
    finally:
        m.AGENTS_CONFIG = original
