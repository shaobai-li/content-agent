from fastapi import APIRouter
from pydantic import BaseModel
from app.core.config import DATA_DIR
import json

router = APIRouter()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "kb"

@router.post("/chat")
async def chat(request: ChatRequest):
    """知识库 Agent 聊天接口"""
    # TODO: 实现知识库 agent 逻辑
    return {"reply": f"知识库 Agent 收到消息: {request.content}"}

@router.get("/records")
async def get_records():
    """获取知识库记录"""
    records = []
    kb_path = DATA_DIR / "knowledge_base.jsonl"
    if kb_path.exists():
        with open(kb_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return {"records": records}

