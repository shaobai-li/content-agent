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
    _lazy_seed_workspace,
    _resolve_base_dir_with_override,
    _copy_workspace,
    migrate_workspace_if_needed,
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


# ── _lazy_seed_workspace ───────────────────────────────────────────

def test_lazy_seed_workspace_std_uses_std_template(tmp_path, monkeypatch):
    """std agent → config/agents/std/ 的模板"""
    from app.core.config import _lazy_seed_workspace

    fake_root = tmp_path / "omniage"
    monkeypatch.setattr("app.core.config.OMNIAGE_ROOT", fake_root)
    agents_dir = fake_root / "config" / "agents"
    (agents_dir / "std").mkdir(parents=True, exist_ok=True)
    (agents_dir / "admin").mkdir(parents=True, exist_ok=True)
    (agents_dir / "std" / "SYSTEM.md").write_text("std-prompt", encoding="utf-8")
    (agents_dir / "admin" / "SYSTEM.md").write_text("admin-prompt", encoding="utf-8")

    ws = tmp_path / "workspace"
    ws.mkdir()
    _lazy_seed_workspace(ws, "std")
    assert (ws / "SYSTEM.md").read_text(encoding="utf-8") == "std-prompt"


def test_lazy_seed_workspace_admin_uses_admin_template(tmp_path, monkeypatch):
    """admin agent → config/agents/admin/ 的模板"""
    from app.core.config import _lazy_seed_workspace

    fake_root = tmp_path / "omniage"
    monkeypatch.setattr("app.core.config.OMNIAGE_ROOT", fake_root)
    agents_dir = fake_root / "config" / "agents"
    (agents_dir / "std").mkdir(parents=True, exist_ok=True)
    (agents_dir / "admin").mkdir(parents=True, exist_ok=True)
    (agents_dir / "std" / "SYSTEM.md").write_text("std-prompt", encoding="utf-8")
    (agents_dir / "admin" / "SYSTEM.md").write_text("admin-prompt", encoding="utf-8")

    ws = tmp_path / "workspace"
    ws.mkdir()
    _lazy_seed_workspace(ws, "admin")
    assert (ws / "SYSTEM.md").read_text(encoding="utf-8") == "admin-prompt"


def test_lazy_seed_workspace_user_agent_falls_back_to_std(tmp_path, monkeypatch):
    """用户自定义 agent → 回退到 config/agents/std/ 的模板"""
    from app.core.config import _lazy_seed_workspace

    fake_root = tmp_path / "omniage"
    monkeypatch.setattr("app.core.config.OMNIAGE_ROOT", fake_root)
    agents_dir = fake_root / "config" / "agents"
    (agents_dir / "std").mkdir(parents=True, exist_ok=True)
    (agents_dir / "std" / "SYSTEM.md").write_text("std-prompt", encoding="utf-8")

    ws = tmp_path / "workspace"
    ws.mkdir()
    _lazy_seed_workspace(ws, "a_abc123")
    assert (ws / "SYSTEM.md").read_text(encoding="utf-8") == "std-prompt"


def test_lazy_seed_workspace_does_not_overwrite(tmp_path, monkeypatch):
    """已存在的 SYSTEM.md 不应被覆盖"""
    from app.core.config import _lazy_seed_workspace

    fake_root = tmp_path / "omniage"
    monkeypatch.setattr("app.core.config.OMNIAGE_ROOT", fake_root)
    agents_dir = fake_root / "config" / "agents"
    (agents_dir / "std").mkdir(parents=True, exist_ok=True)
    (agents_dir / "std" / "SYSTEM.md").write_text("std-prompt", encoding="utf-8")

    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "SYSTEM.md").write_text("user-modified", encoding="utf-8")
    _lazy_seed_workspace(ws, "std")
    assert (ws / "SYSTEM.md").read_text(encoding="utf-8") == "user-modified"


def test_lazy_seed_workspace_copies_bootstrap_files(tmp_path, monkeypatch):
    """SOUL.md/USER.md 也应一并 seed（IDENTITY.md 无模板时不创建）"""
    from app.core.config import _lazy_seed_workspace

    fake_root = tmp_path / "omniage"
    monkeypatch.setattr("app.core.config.OMNIAGE_ROOT", fake_root)
    agents_dir = fake_root / "config" / "agents"
    (agents_dir / "std").mkdir(parents=True, exist_ok=True)
    (agents_dir / "std" / "SYSTEM.md").write_text("system", encoding="utf-8")
    (agents_dir / "std" / "SOUL.md").write_text("soul", encoding="utf-8")
    (agents_dir / "std" / "USER.md").write_text("user", encoding="utf-8")

    ws = tmp_path / "workspace"
    ws.mkdir()
    _lazy_seed_workspace(ws, "std")
    assert (ws / "SYSTEM.md").read_text(encoding="utf-8") == "system"
    assert (ws / "SOUL.md").read_text(encoding="utf-8") == "soul"
    assert (ws / "USER.md").read_text(encoding="utf-8") == "user"
    assert not (ws / "IDENTITY.md").exists()


def test_lazy_seed_workspace_skips_missing_template(tmp_path, monkeypatch):
    """config/agents/ 目录不存在时静默跳过"""
    from app.core.config import _lazy_seed_workspace

    fake_root = tmp_path / "omniage"
    monkeypatch.setattr("app.core.config.OMNIAGE_ROOT", fake_root)
    ws = tmp_path / "workspace"
    ws.mkdir()
    _lazy_seed_workspace(ws, "nonexistent")
    assert not (ws / "SYSTEM.md").exists()


# ── _resolve_base_dir_with_override ─────────────────────────────────

def test_resolve_base_dir_with_override_default(tmp_path):
    """user_data_dir 为空时 → DEFAULT_DATA_DIR/u_{user_id}/<agent_id>/"""
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = _resolve_base_dir_with_override("my_agent", "u1", "")
    assert result == (tmp_path / "u_u1" / "my_agent").resolve()


def test_resolve_base_dir_with_override_admin(tmp_path):
    """admin → DEFAULT_DATA_DIR/u_{user_id}/admin/（不受 user_data_dir 影响）"""
    with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
        result = _resolve_base_dir_with_override("admin", "u1", "/custom/path")
    assert result == (tmp_path / "u_u1" / "admin").resolve()


def test_resolve_base_dir_with_override_custom(tmp_path):
    """user_data_dir 非空时 → {user_data_dir}/<agent_id>/"""
    result = _resolve_base_dir_with_override("my_agent", "u1", str(tmp_path))
    assert result == (tmp_path / "my_agent").resolve()


# ── _copy_workspace ─────────────────────────────────────────────────

def test_copy_workspace_copies_all_content(tmp_path):
    """递归复制整个 workspace 内容"""
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    (src / "sub").mkdir(parents=True)
    (src / "file.txt").write_text("hello", encoding="utf-8")
    (src / "sub" / "nested.txt").write_text("nested", encoding="utf-8")

    _copy_workspace(src, dst)
    assert (dst / "file.txt").read_text(encoding="utf-8") == "hello"
    assert (dst / "sub" / "nested.txt").read_text(encoding="utf-8") == "nested"


def test_copy_workspace_skips_existing_dest(tmp_path):
    """目标路径已存在时跳过复制"""
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    (src / "file.txt").write_text("from-src", encoding="utf-8")
    (dst / "existing.txt").write_text("from-dst", encoding="utf-8")

    _copy_workspace(src, dst)
    assert not (dst / "file.txt").exists()
    assert (dst / "existing.txt").read_text(encoding="utf-8") == "from-dst"


# ── migrate_workspace_if_needed ─────────────────────────────────────

def test_migrate_workspace_if_needed_copies(tmp_path):
    """user_data_dir 变化时将非 admin agent 的 workspace 复制到新路径"""
    import app.core.config as m
    original = dict(m.AGENTS_CONFIG)

    try:
        m.AGENTS_CONFIG = {"std": {"name": "std"}, "admin": {"name": "admin"}}

        old_root = tmp_path / "old_data"
        new_root = tmp_path / "new_data"
        (old_root / "std").mkdir(parents=True)
        (old_root / "std" / "SYSTEM.md").write_text("old-prompt", encoding="utf-8")
        (old_root / "admin").mkdir(parents=True)
        (old_root / "admin" / "SYSTEM.md").write_text("admin-prompt", encoding="utf-8")

        with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
            migrate_workspace_if_needed("u1", str(old_root), str(new_root))

        # std → 迁移到新路径
        assert (new_root / "std" / "SYSTEM.md").read_text(encoding="utf-8") == "old-prompt"
        # admin → 不迁移（admin 始终在 DEFAULT_DATA_DIR）
        assert not (new_root / "admin" / "SYSTEM.md").exists()
    finally:
        m.AGENTS_CONFIG = original


def test_migrate_workspace_if_needed_skips_same_dir(tmp_path):
    """新旧 user_data_dir 相同时跳过"""
    import app.core.config as m
    original = dict(m.AGENTS_CONFIG)

    try:
        m.AGENTS_CONFIG = {"std": {}}
        migrate_workspace_if_needed("u1", str(tmp_path), str(tmp_path))
        # 不崩溃即通过
    finally:
        m.AGENTS_CONFIG = original


def test_migrate_workspace_if_needed_skips_existing_new(tmp_path):
    """新路径已存在时跳过（不覆盖）"""
    import app.core.config as m
    original = dict(m.AGENTS_CONFIG)

    try:
        m.AGENTS_CONFIG = {"std": {}}
        old_root = tmp_path / "old"
        new_root = tmp_path / "new"
        (old_root / "std").mkdir(parents=True)
        (old_root / "std" / "SYSTEM.md").write_text("old", encoding="utf-8")
        (new_root / "std").mkdir(parents=True)
        (new_root / "std" / "SYSTEM.md").write_text("existing", encoding="utf-8")

        with patch("app.core.config.DEFAULT_DATA_DIR", tmp_path):
            migrate_workspace_if_needed("u1", str(old_root), str(new_root))

        assert (new_root / "std" / "SYSTEM.md").read_text(encoding="utf-8") == "existing"
    finally:
        m.AGENTS_CONFIG = original
