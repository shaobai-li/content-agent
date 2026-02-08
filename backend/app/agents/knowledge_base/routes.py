from fastapi import APIRouter, File, UploadFile, Form
from typing import Optional, List
from pydantic import BaseModel
from app.core.config import get_agent_knowledge_base_path
import json

router = APIRouter()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "kb"

@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    meta: Optional[str] = Form(None),
    agent_id: str = Form("kb")
):
    """
    知识库 Agent 统一聊天接口
    支持三种场景：
    1. 纯文本消息
    2. 纯文件附件
    3. 文本 + 文件附件
    """
    # 解析元数据
    meta_data = {}
    if meta:
        try:
            meta_data = json.loads(meta)
        except:
            pass
    
    # 构建响应内容
    reply_parts = []
    
    # 处理文本
    if text:
        reply_parts.append(f"收到文本消息: {text}")
    
    # 处理文件
    if attachments:
        file_info = []
        for file in attachments:
            file_info.append({
                "filename": file.filename,
                "content_type": file.content_type,
                "size": file.size if hasattr(file, 'size') else 'unknown'
            })
        
        file_names = [f["filename"] for f in file_info]
        reply_parts.append(f"收到 {len(attachments)} 个文件: {', '.join(file_names)}")
    
    # 如果既没有文本也没有文件
    if not reply_parts:
        reply_parts.append("未收到任何内容")
    
    reply = "\n".join(reply_parts)
    
    return {
        "reply": reply,
        "meta": meta_data,
        "received": {
            "text": text,
            "attachments_count": len(attachments) if attachments else 0
        }
    }

@router.get("/records")
async def get_records():
    """获取知识库记录"""
    records = []
    kb_path = get_agent_knowledge_base_path("kb")
    if kb_path.exists():
        with open(kb_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return {"records": records}

