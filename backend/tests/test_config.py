from pathlib import Path
from unittest.mock import patch, mock_open, MagicMock
import pytest
from app.core.config import (
    get_agent_base_dir,
    get_agent_workspace_dir,
    get_agent_local_data_dir,
    get_agent_attachment_cache_dir,
    get_agent_sessions_path,
    get_agent_knowledge_base_path,
    get_agent_skill_ids,
    _load_agent_configs,
    parse_system_md_frontmatter,
    _load_user_config,
    _save_user_config,
    get_provider_config,
)


# ── _load_agent_configs ────────────────────────────────────────────────────

def _mock_system_md(content: str) -> MagicMock:
    """创建一个模拟 Path 对象，read_text 返回指定的 SYSTEM.md 内容。"""
    m = MagicMock(spec=Path)
    m.is_file.return_value = True
    m.read_text.return_value = content
    return m


def test_load_agent_configs_empty_dir():
    """agents_dir 不存在时返回空 dict。"""
    with patch.object(Path, "is_dir", return_value=False):
        result = _load_agent_configs()
        assert result == {}


def test_load_agent_configs_loads_system_md(tmp_path):
    """扫描 config/agents/*/SYSTEM.md，目录名为 agent_id。"""
    agent_dir = tmp_path / "std"
    agent_dir.mkdir()
    system_md = agent_dir / "SYSTEM.md"
    system_md.write_text("---\nname: 标准助手\n---\n\n提示词正文", encoding="utf-8")

    with patch("app.core.config.OMNIAGE_ROOT", tmp_path):
        result = _load_agent_configs()
    assert "std" in result
    assert result["std"]["name"] == "标准助手"


def test_load_agent_configs_skips_non_dir(tmp_path):
    """非目录的 entry 被跳过。"""
    # 创建 agents 目录，里面放一个文件类型的 entry（不是目录）
    agents_dir = tmp_path / "config" / "agents"
    agents_dir.mkdir(parents=True)
    (agents_dir / "not_a_dir.txt").write_text("", encoding="utf-8")

    with patch("app.core.config.OMNIAGE_ROOT", tmp_path / "config"):
        result = _load_agent_configs()
    assert result == {}


def test_load_agent_configs_skips_missing_system_md():
    """没有 SYSTEM.md 的目录被跳过。"""
    agent_dir = MagicMock(spec=Path)
    agent_dir.is_dir.return_value = True
    agent_dir.name = "std"
    system_md = MagicMock(spec=Path)
    system_md.is_file.return_value = False
    agent_dir.__truediv__.return_value = system_md

    with patch.object(Path, "is_dir", return_value=True), \
         patch.object(Path, "iterdir", return_value=[agent_dir]):
        result = _load_agent_configs()
    assert result == {}


def test_load_agent_configs_skips_invalid_frontmatter():
    """SYSTEM.md frontmatter 格式无效时跳过。"""
    agent_dir = MagicMock(spec=Path)
    agent_dir.is_dir.return_value = True
    agent_dir.name = "bad"

    system_md = _mock_system_md("plain text without frontmatter")
    agent_dir.__truediv__.return_value = system_md

    with patch.object(Path, "is_dir", return_value=True), \
         patch.object(Path, "iterdir", return_value=[agent_dir]):
        result = _load_agent_configs()
    assert result == {}


def test_load_agent_configs_strips_agent_id_key():
    """frontmatter 中的 agent_id 字段被移除。"""
    agent_dir = MagicMock(spec=Path)
    agent_dir.is_dir.return_value = True
    agent_dir.name = "std"

    system_md = _mock_system_md("---\nagent_id: should_be_ignored\nname: test\n---\n\nbody")
    agent_dir.__truediv__.return_value = system_md

    with patch.object(Path, "is_dir", return_value=True), \
         patch.object(Path, "iterdir", return_value=[agent_dir]):
        result = _load_agent_configs()
    assert "std" in result
    assert "agent_id" not in result["std"]
    assert result["std"]["name"] == "test"


# ── parse_system_md_frontmatter ────────────────────────────────────────────

def test_parse_system_md_frontmatter_valid(tmp_path):
    path = tmp_path / "SYSTEM.md"
    path.write_text("---\nname: test\nskills:\n  - skill_a\n---\n\nbody text", encoding="utf-8")
    result = parse_system_md_frontmatter(path)
    assert result == {"name": "test", "skills": ["skill_a"]}


def test_parse_system_md_frontmatter_no_frontmatter(tmp_path):
    path = tmp_path / "SYSTEM.md"
    path.write_text("just body text", encoding="utf-8")
    assert parse_system_md_frontmatter(path) is None


def test_parse_system_md_frontmatter_non_dict(tmp_path):
    path = tmp_path / "SYSTEM.md"
    path.write_text("---\n- list\n- not\n- dict\n---\n\nbody", encoding="utf-8")
    assert parse_system_md_frontmatter(path) is None


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
