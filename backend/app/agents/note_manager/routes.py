from fastapi import APIRouter
from pydantic import BaseModel
from app.agents import NoteManager
from app.core.config import DATA_DIR
import json

router = APIRouter()
note_manager = NoteManager()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "nm"  # 可选，用于日志

@router.post("/chat")
async def chat(request: ChatRequest):
    """笔记管理 Agent 聊天接口"""
    result = await note_manager.handle_user_message(request.content)
    return result

@router.get("/records")
async def get_records():
    """获取笔记管理记录"""
    records = []
    records_path = DATA_DIR / "records.jsonl"
    if records_path.exists():
        with open(records_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return {"records": records}

