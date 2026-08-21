import json
import uuid
from typing import Any, Dict, List, Optional

import yaml
from fastapi import APIRouter, Body, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from loguru import logger

from app.service.sessions_service import load_sessions, delete_session
from app.service.messages_service import load_messages
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
)
from app.runtime.agent_registry import get_agent_config
from app.runtime.agent_turn_context import build_agent_turn_context
from app.core.config import (
    DEFAULT_DATA_DIR,
    DEFAULT_AGENT_TITLE,
    get_agent_base_dir,
    parse_system_md_frontmatter,
)
from app.core.auth import get_current_user_id

# create_agent 创建自定义 agent 时写入 SYSTEM.md 的默认布局（聊天记录 + 设置视图）
# 工厂函数而非模块级常量：每次返回新对象，避免共享可变引用被就地修改而污染全局默认
def _default_agent_layout() -> dict:
    return {
        "left": ["history", "settings"],
        "defaultLeft": "history",
        "right": ["chat"],
        "defaultRight": "chat",
    }


def _read_user_system_meta(agent_id: str) -> Optional[Dict[str, Any]]:
    """读取当前用户在 agent workspace 的 SYSTEM.md frontmatter（与设置页/运行时同源）。

    无用户上下文（未认证）或文件缺失时返回 None，调用方回退启动缓存 AGENTS_CONFIG。
    """
    try:
        path = get_agent_base_dir(agent_id) / "SYSTEM.md"
        if not path.is_file():
            return None
        meta = parse_system_md_frontmatter(path)
        return meta if isinstance(meta, dict) else None
    except (LookupError, yaml.YAMLError, UnicodeDecodeError, OSError):
        # 无 X-User-Id 上下文 / SYSTEM.md 非法（非 UTF-8 或 frontmatter 非 YAML）→ 回退内置
        return None


# ── Agent 列表（不含 agent_id 路径参数） ─────────────────────────
list_router = APIRouter(prefix="/api", tags=["agents"])


@list_router.get("/agents")
async def list_agents():
    """返回所有注册 agent 的元信息（含当前用户的 custom agent，供前端动态渲染）。"""
    from app.core.config import AGENTS_CONFIG
    from app.core.auth import _user_agents_var

    logger.info("list agents")
    result = []

    # 系统 agent
    for agent_id, cfg in AGENTS_CONFIG.items():
        if not isinstance(cfg, dict):
            continue
        meta = {
            "name": agent_id,
            "title": cfg.get("title", DEFAULT_AGENT_TITLE),
            "description": cfg.get("description", ""),
            "locked": cfg.get("locked", False),
            "layout": cfg.get("layout"),  # 原样返回 SYSTEM.md 的 layout，缺失时不兜底（删除页面即不再显示）
        }
        # 用户 workspace 的 SYSTEM.md 覆盖内置（与设置页编辑/运行时 prompt 同源）
        # 仅覆盖「显式声明且非 null」的字段：description: null 等显式空值按未覆盖处理，
        # 避免把响应字段置为 null（spec 中 description 为 string）
        user_meta = _read_user_system_meta(agent_id)
        if user_meta:
            for key in ("title", "description", "locked", "layout"):
                if key in user_meta and user_meta[key] is not None:
                    meta[key] = user_meta[key]
        result.append(meta)

    # 当前用户的 custom agent
    try:
        user_agents = _user_agents_var.get()
        for agent_id, cfg in user_agents.items():
            if agent_id not in AGENTS_CONFIG:
                result.append({
                    "name": agent_id,
                    "title": cfg.get("title", DEFAULT_AGENT_TITLE),
                    "description": cfg.get("description", ""),
                    "locked": False,
                    "layout": cfg.get("layout"),  # 原样返回 SYSTEM.md 的 layout，缺失时不兜底（删除页面即不再显示）
                })
    except LookupError:
        pass

    return {"agents": result}


@list_router.post("/agents")
async def create_agent(payload: dict = Body(...)):
    """创建自定义智能体，返回 agent_id。"""
    title = (payload.get("title") or "").strip()
    if not title:
        return {"ok": False, "error_code": "AGENT_TITLE_REQUIRED", "error": "智能体标题不能为空"}
    if len(title) > 20:
        return {"ok": False, "error_code": "AGENT_TITLE_TOO_LONG", "error": "智能体标题不能超过20个字符"}

    description = (payload.get("description") or "").strip()
    if len(description) > 200:
        return {"ok": False, "error_code": "AGENT_DESCRIPTION_TOO_LONG", "error": "智能体描述不能超过200个字符"}

    user_id = get_current_user_id()

    # 生成 agent_id: a_ + UUID 前 8 位 hex
    agent_id = f"a_{uuid.uuid4().hex[:8]}"

    # 构造 SYSTEM.md 并写入（使用 YAML 序列化防止注入）
    import yaml as _yaml
    meta = {"title": title, "name": agent_id}
    if description:
        meta["description"] = description
    meta["layout"] = _default_agent_layout()  # 自定义 agent 默认视图：聊天记录 + 设置
    frontmatter = _yaml.dump(meta, allow_unicode=True)
    system_content = f"---\n{frontmatter}---\n"
    system_path = get_agent_base_dir(agent_id) / "SYSTEM.md"
    system_path.parent.mkdir(parents=True, exist_ok=True)
    system_path.write_text(system_content, encoding="utf-8")

    logger.info("created custom agent: {} ({})", agent_id, title)
    return {"ok": True, "agent": {"name": agent_id, "title": title}}


@list_router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """删除自定义智能体，仅允许删除 a_ 开头的自定义 agent。"""
    # 只允许删除 a_ 开头的自定义智能体
    if not agent_id.startswith("a_"):
        return {"ok": False, "error": "只能删除自定义智能体"}

    # 不允许删除系统智能体
    from app.core.config import AGENTS_CONFIG
    if agent_id in AGENTS_CONFIG:
        return {"ok": False, "error": f"智能体 '{agent_id}' 是系统智能体，不能删除"}

    # 检查用户登录状态（get_agent_base_dir 内部依赖 get_current_user_id）
    try:
        get_current_user_id()
    except LookupError:
        return {"ok": False, "error": "未登录用户无法删除智能体"}

    system_path = get_agent_base_dir(agent_id) / "SYSTEM.md"
    if not system_path.exists():
        return {"ok": False, "error": f"智能体 '{agent_id}' 不存在"}

    system_path.unlink()
    logger.info("deleted custom agent: {}", agent_id)
    return {"ok": True}


# ── 单个 Agent 操作（含 agent_id 路径参数） ─────────────────────
router = APIRouter(prefix="/api/agents/{agent_id}", tags=["agents"])


@router.get("/sessions")
async def get_sessions(agent_id: str):
    logger.debug("get sessions: {}", agent_id)
    return load_sessions(agent_id)


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(agent_id: str, session_id: str):
    logger.debug("get messages: {} / {}", agent_id, session_id)
    messages = load_messages(agent_id, session_id)

    from app.utils.tool_hints import format_tool_hint

    for msg in messages:
        tool_calls = msg.get("tool_calls")
        if not tool_calls:
            continue
        for tc in tool_calls:
            if "hint" in tc:
                continue  # 已存在则不重复注入
            func = tc.get("function", {})
            name = func.get("name", "")
            raw_args = func.get("arguments", "{}")
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except (json.JSONDecodeError, TypeError):
                args = {}
            tc["hint"] = format_tool_hint(name, args)

    return messages

@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(agent_id: str, session_id: str):
    logger.info("delete session: {} / {}", agent_id, session_id)
    return delete_session(agent_id, session_id)
@router.get("/res/{res_name}")
async def get_resources(agent_id: str, res_name: str, kb_id: str):
    """获取指定 Agent 的资源列表（nodes.json 为 nodes）
    
    Args:
        kb_id: 必须指定知识库ID
    """
    if res_name == "nodes":
        from app.service.records_service import get_all_records
        nodes = get_all_records(agent_id, kb_id)
        return {"nodes": nodes}
    return {"error": f"Unknown resource type: {res_name}"}


@router.post("/res/{res_name}")
async def create_resource(agent_id: str, res_name: str, kb_id: str, payload: dict = Body(...)):
    """创建指定 Agent 的资源节点
    
    Args:
        kb_id: 必须指定知识库ID
    """
    if res_name == "nodes":
        from app.service.records_service import create_folder
        return create_folder(
            payload.get("name", ""),
            agent_id,
            kb_id,
            payload.get("parent_id", "fld_root"),
        )
    return {"error": f"Unknown resource type: {res_name}"}

@router.delete("/res/{res_name}/{node_id}")
async def delete_resource(agent_id: str, res_name: str, node_id: str, kb_id: str):
    """删除指定 Agent 的资源节点
    
    Args:
        kb_id: 必须指定知识库ID
    """
    if res_name == "nodes":
        from app.service.records_service import delete_node
        return delete_node(node_id, agent_id, kb_id)
    return {"error": f"Unknown resource type: {res_name}"}

@router.put("/res/{res_name}/{node_id}")
async def update_resource(
    agent_id: str,
    res_name: str,
    node_id: str,
    kb_id: str,
    payload: dict = Body(...),
):
    """更新指定 Agent 的资源节点
    
    Args:
        kb_id: 必须指定知识库ID
    """
    if res_name == "nodes":
        from app.service.records_service import move_node, rename_node

        if "parent_id" in payload:
            return move_node(node_id, payload.get("parent_id", "fld_root"), agent_id, kb_id)

        return rename_node(node_id, payload.get("name", ""), agent_id, kb_id)
    return {"error": f"Unknown resource type: {res_name}"}


@router.get("/knowledge-bases")
async def get_knowledge_bases(agent_id: str):
    from app.service.knowledge_base_registry_service import list_knowledge_bases

    return {"databases": list_knowledge_bases(agent_id)}


@router.post("/knowledge-bases")
async def create_knowledge_base_endpoint(agent_id: str, payload: dict = Body(...)):
    from app.service.knowledge_base_registry_service import create_knowledge_base

    return create_knowledge_base(
        payload.get("name", ""),
        payload.get("description", ""),
        agent_id,
    )


@router.delete("/knowledge-bases/{kb_id}")
async def delete_knowledge_base_endpoint(agent_id: str, kb_id: str):
    from app.service.knowledge_base_registry_service import delete_knowledge_base

    return delete_knowledge_base(agent_id, kb_id)


@router.get("/files/tree")
async def get_workspace_tree(agent_id: str):
    from app.service.file_tree_service import build_workspace_tree

    return {"tree": build_workspace_tree(agent_id)}


@router.get("/files/content")
async def get_workspace_file_content(agent_id: str, path: str):
    from app.service.file_tree_service import read_workspace_file

    return {"path": path, "content": read_workspace_file(agent_id, path)}


@router.post("/attachments/cache")
async def upload_attachment_to_agent_cache(agent_id: str, file: UploadFile = File(...)):
    """将单个文件持久化到该 Agent 的 ``workspace/local_data/cache/``，保留原始文件名。"""
    from app.service.file_service import save_upload_to_agent_cache_keep_name

    path = await save_upload_to_agent_cache_keep_name(file, agent_id)
    return {"cached_path": str(path.resolve())}


@router.post("/chat/stream")
async def chat_stream(
    agent_id: str,
    text: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    mentions: Optional[str] = Form(None),
    attachment_paths: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    provider: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
):
    logger.info("chat stream: {} session={}", agent_id, session_id)

    agent_config = get_agent_config(agent_id)

    if not agent_config:
        # 检查是否是当前用户的 custom agent，动态创建 StandardAgent
        from app.core.auth import _user_agents_var
        try:
            user_agents = _user_agents_var.get()
            if agent_id in user_agents:
                from app.agents.standard.agent import StandardAgent
                from app.runtime.agent_registry import register_agent
                instance = StandardAgent(agent_id=agent_id)
                register_agent(instance)
                agent_config = get_agent_config(agent_id)
                logger.info("dynamically created StandardAgent for custom agent: {}", agent_id)
        except LookupError:
            pass

    if not agent_config:
        logger.warning("unknown agent: {}", agent_id)
        async def _unknown():
            yield build_stream_chunk(f"Unknown agent: {agent_id}")
            yield build_stream_done(session_id="")
        return StreamingResponse(
            _unknown(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    ctx = build_agent_turn_context(
        agent_id,
        text=text,
        session_id=session_id,
        mentions=mentions,
        attachments=attachments,
        attachment_paths=attachment_paths,
        provider=provider,
        model=model,
    )

    return StreamingResponse(
        agent_config.handle_chat_stream(ctx),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )