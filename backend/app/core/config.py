import os
from pathlib import Path
import yaml
from typing import Dict, Any, List

from dotenv import load_dotenv
load_dotenv()

# 绝对路径：从 .env 读取
DATA_DIR = Path(os.getenv("DATA_DIR", ".")).resolve()

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# ── 全局 config.yaml（顶级全局配置） ──────────────────────────────
CONFIG_PATH = _PROJECT_ROOT / "config.yaml"
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f) or {}


# ── 加载 per‑agent YAML（config/agents/<agent_id>.yaml） ─────────
def _load_agent_yamls() -> Dict[str, Dict[str, Any]]:
    """扫描 config/agents/*.yaml，文件名（不含扩展名）即为 agent_id。"""
    agents_dir = _PROJECT_ROOT / "config" / "agents"
    result: Dict[str, Dict[str, Any]] = {}
    if not agents_dir.is_dir():
        return result
    for yaml_path in sorted(agents_dir.glob("*.yaml")):
        agent_id = yaml_path.stem  # e.g. "std", "w"
        with open(yaml_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            continue
        data.pop("agent_id", None)   # 以文件名为准
        result[agent_id] = data
    return result


# ── 合并：config/agents/*.yaml 优先，config.yaml agents 作为降级 ──
_agent_yamls = _load_agent_yamls()
_old_agents = config.get("agents", {}) or {}

# 仅包含系统 agent（config/agents/*.yaml + config.yaml agents 字段）
# 用户自定义 agent 在 auth.require_user_id() 中按需加载
AGENTS_CONFIG: Dict[str, Dict[str, Any]] = {
    **_old_agents,
    **_agent_yamls,
}

def get_agent_config(agent_id: str) -> Dict[str, Any]:
    agent_config = AGENTS_CONFIG.get(agent_id, {})
    if not agent_config:
        raise ValueError(f"Agent '{agent_id}' 配置不存在")
    return agent_config


def get_agent_base_dir(agent_id: str) -> Path:
    from app.core.auth import get_current_user_id
    user_id = get_current_user_id()
    return (DATA_DIR / f"u_{user_id}" / "data" / agent_id).resolve()


def get_agent_workspace_dir(agent_id: str) -> Path:
    """Agent 工作区根目录：<base>/.local/"""
    ws = get_agent_base_dir(agent_id) / ".local"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def get_agent_local_data_dir(agent_id: str) -> Path:
    """用户数据根目录：<base>/knowledge_base/（知识库、注册表等）。"""
    local_data = get_agent_base_dir(agent_id) / "knowledge_base"
    local_data.mkdir(parents=True, exist_ok=True)
    return local_data


def get_agent_attachment_cache_dir(agent_id: str) -> Path:
    """附件缓存：<base>/.local/cache/"""
    cache = get_agent_workspace_dir(agent_id) / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def get_agent_sessions_path(agent_id: str) -> Path:
    return get_agent_workspace_dir(agent_id) / "sessions.json"


def get_agent_messages_path(agent_id: str) -> Path:
    return get_agent_workspace_dir(agent_id) / "messages.json"


def get_agent_knowledge_base_path(agent_id: str, kb_id: str) -> Path:
    """
    获取 Agent 知识库路径（已废弃，仅保留用于向后兼容）
    建议直接使用 knowledge_base_registry_service.get_database_nodes_path(agent_id, kb_id)
    """
    from app.service.knowledge_base_registry_service import get_database_nodes_path
    return get_database_nodes_path(agent_id, kb_id)


def get_agent_skill_ids(agent_id: str) -> List[str]:
    """config.yaml 中 agents.<id>.skills 列出的仓库内 skill 目录名（app/agents/skills/<id>/）。"""
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