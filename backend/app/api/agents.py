from typing import Optional, List
from fastapi import APIRouter, Body, Form, File, UploadFile
from fastapi.responses import StreamingResponse

from app.service.sessions_service import load_sessions, delete_session
from app.service.messages_service import load_messages
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
)
from app.runtime.agent_registry import get_agent_config
from app.runtime.agent_turn_context import build_agent_turn_context

router = APIRouter(prefix="/api/agents/{agent_id}", tags=["agents"])


@router.get("/sessions")
async def get_sessions(agent_id: str):
    return load_sessions(agent_id)


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(agent_id: str, session_id: str):
    return load_messages(agent_id, session_id)

@router.delete("/sessions/{session_id}")
async def delete_session_endpoint(agent_id: str, session_id: str):
    return delete_session(agent_id, session_id)
@router.get("/res/{res_name}")
async def get_resources(agent_id: str, res_name: str, kb_id: Optional[str] = None):
    """获取指定 Agent 的资源列表（nodes.json 为 nodes）"""
    if res_name == "nodes":
        from app.service.records_service import get_all_records
        nodes = get_all_records(agent_id, kb_id)
        return {"nodes": nodes}
    return {"error": f"Unknown resource type: {res_name}"}


@router.post("/res/{res_name}")
async def create_resource(agent_id: str, res_name: str, payload: dict = Body(...), kb_id: Optional[str] = None):
    """创建指定 Agent 的资源节点"""
    if res_name == "nodes":
        from app.service.records_service import create_folder
        return create_folder(
            payload.get("name", ""),
            agent_id,
            payload.get("parent_id", "fld_root"),
            kb_id,
        )
    return {"error": f"Unknown resource type: {res_name}"}

@router.delete("/res/{res_name}/{node_id}")
async def delete_resource(agent_id: str, res_name: str, node_id: str, kb_id: Optional[str] = None):
    """删除指定 Agent 的资源节点"""
    if res_name == "nodes":
        from app.service.records_service import delete_node
        return delete_node(node_id, agent_id, kb_id)
    return {"error": f"Unknown resource type: {res_name}"}

@router.put("/res/{res_name}/{node_id}")
async def update_resource(
    agent_id: str,
    res_name: str,
    node_id: str,
    payload: dict = Body(...),
    kb_id: Optional[str] = None,
):
    """更新指定 Agent 的资源节点"""
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

@router.post("/chat/stream")
async def chat_stream(
    agent_id: str,
    text: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    mentions: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None)
):
    agent_config = get_agent_config(agent_id)

    if not agent_config:
        async def _unknown():
            yield build_stream_chunk(f"Unknown agent: {agent_id}")
            yield build_stream_done(session_id="")
        return StreamingResponse(_unknown(), media_type="application/json")

    ctx = build_agent_turn_context(
        agent_id,
        text=text,
        session_id=session_id,
        mentions=mentions,
        attachments=attachments,
    )

    return StreamingResponse(
        agent_config.handle_chat_stream(ctx),
        media_type="application/json",
    )