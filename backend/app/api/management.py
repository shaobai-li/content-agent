"""Management 面板聚合接口：返回所有非 admin 智能体的摘要信息。"""

from fastapi import APIRouter
from loguru import logger

from app.core.config import AGENTS_CONFIG
from app.core.auth import _user_agents_var
from app.service.sessions_service import load_sessions
from app.service.messages_service import load_messages

router = APIRouter(prefix="/api/management", tags=["management"])

# 供应商 → 默认模型映射，与 app.providers.factory._default_model_for 保持同步
_DEFAULT_MODELS: dict[str, str] = {
    "deepseek": "deepseek-chat",
    "openai": "gpt-4o",
    "moonshot": "kimi-k2.5",
}


def _resolve_model(cfg: dict) -> str:
    """从 agent 配置解析显示用模型名。

    优先级：
      1. cfg.model（YAML 中显式指定）
      2. cfg.provider → 已知映射
      3. 兜底 "deepseek-chat"
    """
    explicit = cfg.get("model")
    if explicit:
        return explicit
    provider = cfg.get("provider", "deepseek")
    return _DEFAULT_MODELS.get(provider, f"{provider}-chat")


def _build_agent_summary(agent_id: str, cfg: dict) -> dict:
    """为单个 agent 构建摘要（会话数、最近回复时间、最近会话标题）。"""
    name = cfg.get("name", agent_id)
    locked = cfg.get("locked", False)

    sessions = load_sessions(agent_id)
    session_count = len(sessions)
    last_session_title = sessions[0]["title"] if sessions else None

    last_reply_time = None
    if sessions:
        first_session_id = sessions[0]["session_id"]
        messages = load_messages(agent_id, first_session_id)
        # 倒序查找最后一条 assistant 消息的 created_at
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                last_reply_time = msg.get("created_at")
                break

    model = _resolve_model(cfg)

    return {
        "id": agent_id,
        "name": name,
        "locked": locked,
        "model": model,
        "session_count": session_count,
        "last_reply_time": last_reply_time,
        "last_session_title": last_session_title,
    }


@router.get("/agents-summary")
async def get_agents_summary():
    """返回所有非 admin 智能体的聚合摘要列表。"""
    agents = []

    # 系统 agent（config/agents/*.yaml + config.yaml agents）
    for agent_id, cfg in AGENTS_CONFIG.items():
        if agent_id == "admin":
            continue
        if not isinstance(cfg, dict):
            continue
        agents.append(_build_agent_summary(agent_id, cfg))

    # 当前用户的 custom agent
    try:
        user_agents = _user_agents_var.get()
        for agent_id, cfg in user_agents.items():
            if agent_id in AGENTS_CONFIG:
                continue  # 已在系统 agent 中
            agents.append(_build_agent_summary(agent_id, cfg))
    except LookupError:
        pass

    logger.info("management agents-summary: count={}", len(agents))
    return {"agents": agents}
