from pathlib import Path
from unittest.mock import patch, mock_open
import pytest
from app.core.config import (
    get_agent_base_dir,
    get_agent_workspace_dir,
    get_agent_local_data_dir,
    get_agent_attachment_cache_dir,
    get_agent_sessions_path,
    get_agent_knowledge_base_path,
    get_agent_skill_ids,
    _load_agent_yamls,
    _load_user_config,
    _save_user_config,
    get_provider_config,
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
# path functions implicitly tested via AGENTS_CONFIG populated in conftest/dotenv.

# ── get_agent_base_dir ─────────────────────────────────────────────────────

def test_get_agent_base_dir(tmp_path):
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path), \
         patch("app.core.auth.get_current_user_id", return_value="1"):
        result = get_agent_base_dir("ag")
    assert result == (tmp_path / "u_1" / "ag").resolve()


def test_get_agent_base_dir_admin(tmp_path):
    """admin agent 永远在 DEFAULT_DATA_DIR/u_{user_id}/admin/"""
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path), \
         patch("app.core.auth.get_current_user_id", return_value="1"):
        result = get_agent_base_dir("admin")
    assert result == (tmp_path / "u_1" / "admin").resolve()


def test_get_agent_base_dir_with_user_data_dir(tmp_path):
    """config.json 中设置 user_data_dir 时，其他 agent 路径指向 user_data_dir/{agent_id}"""
    user_data_path = tmp_path / "my_data"
    user_data_path.mkdir()
    # 写入 config.json
    config_dir = tmp_path / "u_1" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"user_data_dir": "' + str(user_data_path).replace("\\", "\\\\") + '"}',
        encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path), \
         patch("app.core.auth.get_current_user_id", return_value="1"):
        result = get_agent_base_dir("my_agent")
    assert result == (user_data_path / "my_agent").resolve()


# ── _load_user_config ──────────────────────────────────────────────────────

def test_load_user_config_file_not_exists(tmp_path):
    """config.json 不存在时返回空 dict。"""
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = _load_user_config("nonexistent")
    assert result == {}


def test_load_user_config_file_exists(tmp_path):
    """config.json 存在时正确读取内容。"""
    config_dir = tmp_path / "u_99" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"user_data_dir": "D:/my_data"}', encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = _load_user_config("99")
    assert result == {"user_data_dir": "D:/my_data"}


# ── _save_user_config ──────────────────────────────────────────────────────

def test_save_user_config_writes_file(tmp_path):
    """_save_user_config 正确写入 config.json。"""
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        _save_user_config("1", {"user_data_dir": "D:/test"})
    config_path = tmp_path / "u_1" / "admin" / "config.json"
    assert config_path.exists()
    content = config_path.read_text(encoding="utf-8")
    assert '"user_data_dir"' in content
    assert '"D:/test"' in content


def test_save_user_config_overwrites(tmp_path):
    """_save_user_config 覆盖已有文件。"""
    config_dir = tmp_path / "u_1" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"old": "value"}', encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        _save_user_config("1", {"user_data_dir": "D:/new"})
    config_path = tmp_path / "u_1" / "admin" / "config.json"
    content = config_path.read_text(encoding="utf-8")
    assert '"user_data_dir"' in content
    assert '"old"' not in content


# ── get_provider_config ───────────────────────────────────────────────────

def test_get_provider_config_no_providers(tmp_path):
    """config.json 中无 providers 字段时返回空 dict。"""
    config_dir = tmp_path / "u_1" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"user_data_dir": "D:/data"}', encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = get_provider_config("1", "deepseek")
    assert result == {}


def test_get_provider_config_missing_provider(tmp_path):
    """请求的 provider 不存在时返回空 dict。"""
    config_dir = tmp_path / "u_1" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"providers": {"deepseek": {"api_key": "sk-xxx"}}}', encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = get_provider_config("1", "unknown")
    assert result == {}


def test_get_provider_config_returns_config(tmp_path):
    """正常返回 provider 的 api_key 和 api_base。"""
    config_dir = tmp_path / "u_1" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"providers": {"deepseek": {"api_key": "sk-xxx", "api_base": "https://custom.com/v1"}}}',
        encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = get_provider_config("1", "deepseek")
    assert result == {"api_key": "sk-xxx", "api_base": "https://custom.com/v1"}


def test_get_provider_config_partial_config(tmp_path):
    """config.json 中只有 api_key 没有 api_base 时，只返回 api_key。"""
    config_dir = tmp_path / "u_1" / "admin"
    config_dir.mkdir(parents=True)
    (config_dir / "config.json").write_text(
        '{"providers": {"openai": {"api_key": "sk-ooo"}}}', encoding="utf-8",
    )
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = get_provider_config("1", "openai")
    assert result == {"api_key": "sk-ooo"}


# ── get_agent_workspace_dir ────────────────────────────────────────────────

@patch.object(Path, "mkdir")
@patch("app.core.config.get_agent_base_dir")
def test_get_agent_workspace_dir(mock_base_dir, mock_mkdir, tmp_path):
    mock_base_dir.return_value = tmp_path
    result = get_agent_workspace_dir("ag")
    assert result == tmp_path  # workspace = base_dir, not .local


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
@patch("app.core.config.get_agent_base_dir")
def test_get_agent_attachment_cache_dir(mock_base, mock_mkdir, tmp_path):
    mock_base.return_value = tmp_path
    result = get_agent_attachment_cache_dir("ag")
    assert result == tmp_path / ".local" / "cache"


# ── get_agent_sessions_path ────────────────────────────────────────────────

@patch("app.core.config.get_agent_base_dir")
def test_get_agent_sessions_path(mock_base, tmp_path):
    mock_base.return_value = tmp_path
    result = get_agent_sessions_path("ag")
    assert result == tmp_path / ".local" / "sessions.json"



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
