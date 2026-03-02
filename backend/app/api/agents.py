from fastapi import APIRouter

from app.service.sessions_service import load_sessions
from app.service.messages_service import load_messages

router = APIRouter(prefix="/api", tags=["agents"])


@router.get("/{agent_id}/sessions")
async def get_sessions(agent_id: str):
    return load_sessions(agent_id)


@router.get("/{agent_id}/sessions/{session_id}/messages")
async def get_session_messages(agent_id: str, session_id: str):
    return load_messages(agent_id, session_id)
