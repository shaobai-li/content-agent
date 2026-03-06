from typing import Optional, List
from fastapi import APIRouter, Form, File, UploadFile
from fastapi.responses import StreamingResponse

from app.service.sessions_service import load_sessions, delete_session
from app.service.messages_service import load_messages
from app.service.chat_service import build_chat_response
from app.service.stream_service import build_stream_chunk, build_stream_done
from app.runtime.agent_registry import get_agent_config

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
async def get_resources(agent_id: str, res_name: str):
    """获取指定 Agent 的资源列表"""
    if res_name == "records":
        from app.service.records_service import get_all_records
        records = get_all_records(agent_id)
        return {"records": records}
    return {"error": f"Unknown resource type: {res_name}"}

@router.delete("/res/{res_name}/{record_id}")
async def delete_resource(agent_id: str, res_name: str, record_id: str):
    """删除指定 Agent 的资源记录"""
    if res_name == "records":
        from app.service.records_service import delete_record
        return delete_record(record_id, agent_id)
    return {"error": f"Unknown resource type: {res_name}"}

@router.post("/chat")
async def chat(
    agent_id: str,
    text: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    mentions: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None)
):
    
    agent_config = get_agent_config(agent_id)
    
    if not agent_config:
        return build_chat_response(reply=f"Unknown agent: {agent_id}")
    
    return await agent_config.handle_chat(
        text=text,
        session_id=session_id,
        mentions=mentions,
        attachments=attachments
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

    if not agent_config or not agent_config.handle_chat_stream:
        async def _unknown():
            yield build_stream_chunk(f"Unknown agent: {agent_id}")
            yield build_stream_done(session_id="")
        return StreamingResponse(_unknown(), media_type="application/json")

    return StreamingResponse(
        agent_config.handle_chat_stream(
            text=text,
            session_id=session_id,
            mentions=mentions,
            attachments=attachments
        ),
        media_type="application/json",
    )