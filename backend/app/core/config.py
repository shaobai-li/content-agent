import json
import os
import shutil
from pathlib import Path
import yaml
from typing import Dict, Any, List, Optional

from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OMNIAGE_ROOT = Path(os.getenv("OMNIAGE_ROOT", _PROJECT_ROOT.parent))
ENV_PATH = OMNIAGE_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# 默认数据根目录：固定为 OMNIAGE_ROOT/data，不可被外部修改
DEFAULT_DATA_DIR = (OMNIAGE_ROOT / "data").resolve()

# ── 全局 config.yaml（顶级全局配置） ──────────────────────────────
CONFIG_PATH = OMNIAGE_ROOT / "config.yaml"
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f) or {}


# ── 加载 per‑agent 配置（config/agents/<agent_id>/SYSTEM.md） ──
def parse_system_md_frontmatter(system_md_path: Path) -> Optional[Dict[str, Any]]:
    """解析 SYSTEM.md 的 YAML frontmatter。"""
    content = system_md_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return None
    parts = content.split("---", 2)
    if len(parts) < 3:
        return None
    meta = yaml.safe_load(parts[1])
    if not isinstance(meta, dict):
        return None
    return meta


def _load_agent_configs() -> Dict[str, Dict[str, Any]]:
    """扫描 config/agents/*/SYSTEM.md，目录名即为 agent_id。"""
    agents_dir = OMNIAGE_ROOT / "config" / "agents"
    result: Dict[str, Dict[str, Any]] = {}
    if not agents_dir.is_dir():
        return result
    for entry in sorted(agents_dir.iterdir()):
        if not entry.is_dir():
            continue
        system_md = entry / "SYSTEM.md"
        if not system_md.is_file():
            continue
        agent_id = entry.name
        meta = parse_system_md_frontmatter(system_md)
        if not isinstance(meta, dict):
            continue
        meta.pop("agent_id", None)   # 以文件名为准
        result[agent_id] = meta
    return result


# ── 合并：config/agents/*/SYSTEM.md 优先，config.yaml agents 作为降级 ──
_agent_configs = _load_agent_configs()
_old_agents = config.get("agents", {}) or {}

# 仅包含系统 agent（config/agents/*/SYSTEM.md + config.yaml agents 字段）
# 用户自定义 agent 在 auth.require_user_id() 中按需加载
AGENTS_CONFIG: Dict[str, Dict[str, Any]] = {
    **_old_agents,
    **_agent_configs,
}
def _load_user_config(user_id: str) -> dict:
    """加载 data/u_{user_id}/admin/config.json，文件不存在时返回空 dict。"""
    config_path = DEFAULT_DATA_DIR / f"u_{user_id}" / "admin" / "config.json"
    if config_path.exists():
        return json.loads(config_path.read_text(encoding="utf-8"))
    return {}


def _save_user_config(user_id: str, config: dict) -> None:
    """写入 data/u_{user_id}/admin/config.json。"""
    config_path = DEFAULT_DATA_DIR / f"u_{user_id}" / "admin" / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_provider_config(user_id: str, provider_name: str) -> dict:
    """从 config.json 中读取指定 provider 的配置（api_key, api_base）。

    返回 dict，可能为空（未配置时）。
    """
    user_config = _load_user_config(user_id)
    providers = user_config.get("providers") or {}
    return providers.get(provider_name) or {}


def get_agent_base_dir(agent_id: str) -> Path:
    """获取指定 agent 的工作区基目录。

    - admin agent 永远在 DEFAULT_DATA_DIR/u_{user_id}/admin/
    - 其他 agent：
      若 config.json 中设置了 user_data_dir，则返回 {user_data_dir}/{agent_id}
      否则返回 DEFAULT_DATA_DIR/u_{user_id}/{agent_id}
    """
    from app.core.auth import get_current_user_id

    user_id = get_current_user_id()
    return _resolve_agent_base_dir(agent_id, user_id)


def _resolve_agent_base_dir(agent_id: str, user_id: str) -> Path:
    """内部函数：按指定 user_id 解析 agent base dir（不依赖 auth 上下文）。"""
    default_base = DEFAULT_DATA_DIR / f"u_{user_id}"

    # 管理员 workspace 永远在 data/u_{user_id}/admin/
    if agent_id == "admin":
        return (default_base / "admin").resolve()

    # 读取用户配置中的 user_data_dir
    user_config = _load_user_config(user_id)
    user_data_dir = (user_config.get("user_data_dir") or "").strip()
    if user_data_dir:
        return (Path(user_data_dir).resolve() / agent_id).resolve()
    else:
        return (default_base / agent_id).resolve()


def _lazy_seed_workspace(workspace: Path, agent_id: str) -> None:
    """惰性播种：如果 workspace 缺少 SYSTEM.md，从内置配置补齐。"""
    config_agents_dir = OMNIAGE_ROOT / "config" / "agents"

    # 模板来源规则：
    #   - admin → config/agents/admin/
    #   - 其他所有 agent（std、用户自定义等）→ config/agents/std/
    template_id = "admin" if agent_id == "admin" else "std"
    agent_src = config_agents_dir / template_id

    target = workspace / "SYSTEM.md"
    if not target.exists():
        source = agent_src / "SYSTEM.md"
        if source.exists():
            target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    for name in ("SOUL.md", "USER.md", "IDENTITY.md"):
        target = workspace / name
        if not target.exists():
            source = agent_src / name
            if source.exists():
                target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")


def _resolve_base_dir_with_override(agent_id: str, user_id: str, user_data_dir: str) -> Path:
    """按指定的 user_data_dir 解析 agent base dir（不依赖 config.json 当前值）。

    用于计算 user_data_dir 变更前的旧路径或变更后的新路径。
    """
    default_base = DEFAULT_DATA_DIR / f"u_{user_id}"

    if agent_id == "admin":
        return (default_base / "admin").resolve()

    udd = user_data_dir.strip() if user_data_dir else ""
    if udd:
        return (Path(udd).resolve() / agent_id).resolve()
    else:
        return (default_base / agent_id).resolve()


def _copy_workspace(src: Path, dst: Path) -> None:
    """递归复制 workspace 目录下所有内容到目标路径。

    目标路径已存在时不覆盖（静默跳过）。
    """
    if dst.exists():
        return
    shutil.copytree(src, dst, dirs_exist_ok=False)


def migrate_workspace_if_needed(
    user_id: str,
    old_user_data_dir: str,
    new_user_data_dir: str,
    user_agent_ids: Optional[List[str]] = None,
) -> None:
    """当 user_data_dir 变化时，将所有非 admin agent 的 workspace 从旧路径迁移到新路径。

    在 settings API 写入新 user_data_dir 后调用。
    - admin 固定在 DEFAULT_DATA_DIR，不参与迁移
    - 旧路径不存在时跳过（兼容首次设置）
    - 新路径已存在时跳过（不覆盖已有数据）
    """
    if old_user_data_dir == new_user_data_dir:
        return

    all_ids: set[str] = set(AGENTS_CONFIG.keys())
    if user_agent_ids:
        all_ids |= set(user_agent_ids)

    for agent_id in all_ids:
        if agent_id == "admin":
            continue

        old_base = _resolve_base_dir_with_override(agent_id, user_id, old_user_data_dir)
        new_base = _resolve_base_dir_with_override(agent_id, user_id, new_user_data_dir)

        if old_base == new_base or not old_base.exists() or new_base.exists():
            continue

        _copy_workspace(old_base, new_base)(user_agent_ids: Optional[List[str]] = None) -> None:
    """为当前用户 seed 所有 agent workspace（系统 agent + 用户自定义 agent）。

    在用户认证通过后立即调用，确保该用户的 agent workspace 目录和 prompt 文件已就绪。
    不会覆盖用户已有的文件。
    """
    from app.core.auth import get_current_user_id

    user_id = get_current_user_id()
    if not user_id:
        return

    all_ids: set[str] = set(AGENTS_CONFIG.keys())
    if user_agent_ids:
        all_ids |= set(user_agent_ids)

    for agent_id in all_ids:
        get_agent_workspace_dir(agent_id)


def get_agent_workspace_dir(agent_id: str) -> Path:
    """Agent 工作区根目录：<base>/（.local 仍用于内部状态，见下文）"""
    ws = get_agent_base_dir(agent_id)
    ws.mkdir(parents=True, exist_ok=True)
    _lazy_seed_workspace(ws, agent_id)
    return ws


def get_agent_local_data_dir(agent_id: str) -> Path:
    """用户数据根目录：<base>/knowledge_base/（知识库、注册表等）。"""
    local_data = get_agent_base_dir(agent_id) / "knowledge_base"
    local_data.mkdir(parents=True, exist_ok=True)
    return local_data


def get_agent_attachment_cache_dir(agent_id: str) -> Path:
    """附件缓存：<base>/.local/cache/"""
    cache = get_agent_base_dir(agent_id) / ".local" / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def get_agent_sessions_path(agent_id: str) -> Path:
    return get_agent_base_dir(agent_id) / ".local" / "sessions.json"


def get_agent_session_messages_dir(agent_id: str) -> Path:
    """Agent 会话消息目录：<base>/.local/messages/"""
    return get_agent_base_dir(agent_id) / ".local" / "messages"


def get_agent_session_messages_path(agent_id: str, session_id: str) -> Path:
    """某会话的 .jsonl 文件路径：<base>/.local/messages/<session_id>.jsonl"""
    return get_agent_session_messages_dir(agent_id) / f"{session_id}.jsonl"


def get_agent_knowledge_base_path(agent_id: str, kb_id: str) -> Path:
    """
    获取 Agent 知识库路径（已废弃，仅保留用于向后兼容）
    建议直接使用 knowledge_base_registry_service.get_database_nodes_path(agent_id, kb_id)
    """
    from app.service.knowledge_base_registry_service import get_database_nodes_path
    return get_database_nodes_path(agent_id, kb_id)


def get_agent_skill_ids(agent_id: str) -> List[str]:
    """config/agents/<id>/SYSTEM.md 或 config.yaml 中 agents.<id>.skills 列出的仓库内 skill 目录名。"""
    block = AGENTS_CONFIG.get(agent_id) or {}
    if not block:
        # 再检查用户自定义 agent
        from app.core.auth import _user_agents_var
        try:
            block = _user_agents_var.get().get(agent_id) or {}
        except LookupError:
            block = {}
    raw = block.get("skills", [])
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def get_agent_mcp_servers(agent_id: str = "", user_id: str = "") -> dict:
    """读取 MCP 服务器配置，独立于 agent prompt。

    优先级：
      1. data/u_{user_id}/mcp.yaml（用户覆盖，按需创建）
      2. config/mcp.yaml（内置默认）

    注意：
      user_id 由调用方传入（如 agent.py），避免本模块引入 HTTP/auth 依赖。
    """
    import yaml

    # 1. 内置 config/mcp.yaml
    mcp_yaml_path = OMNIAGE_ROOT / "config" / "mcp.yaml"
    builtin: dict = {}
    if mcp_yaml_path.exists():
        try:
            with open(mcp_yaml_path, "r", encoding="utf-8") as f:
                builtin = yaml.safe_load(f) or {}
        except Exception:
            pass

    # 2. 用户 data/u_{user_id}/mcp.yaml（覆盖内置）
    if user_id:
        user_mcp_path = DEFAULT_DATA_DIR / f"u_{user_id}" / "mcp.yaml"
        if user_mcp_path.exists():
            try:
                with open(user_mcp_path, "r", encoding="utf-8") as f:
                    user_data = yaml.safe_load(f) or {}
                if user_data:
                    return {**builtin, **user_data}  # 用户覆盖内置
            except Exception:
                pass

    return builtin