from fastapi import APIRouter, Form
from typing import Optional
from app.agents import NoteManager
from app.core.config import DATA_DIR
import json

router = APIRouter()
note_manager = NoteManager()

@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("nm")
):

    result = await note_manager.handle_user_message(text)
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

