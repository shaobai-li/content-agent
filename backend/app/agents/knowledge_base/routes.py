from fastapi import APIRouter, File, UploadFile, Form
from typing import Optional, List
from pydantic import BaseModel
from pathlib import Path
import json

from app.core.config import get_agent_knowledge_base_path
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response
from app.service.file_service import process_attachments, FileInfo

router = APIRouter()

async def process_attachment_dummy(file_path: Path, filename: str, content_type: str) -> str:
    """附件处理的 dummy 实现"""
    return f"已处理文件: {filename} (类型: {content_type})"

def save_to_knowledge_base(file_info: FileInfo, agent_id: str = "kb"):
    """将文件信息追加到知识库 jsonl 文件"""
    kb_path = get_agent_knowledge_base_path(agent_id)
    kb_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(kb_path, "a", encoding="utf-8") as f:
        f.write("\n")
        json.dump(file_info.to_kb_format(), f, ensure_ascii=False)


@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    agent_id: str = Form("kb")
):
    """
    知识库 Agent 统一聊天接口
    支持三种场景：
    1. 纯文本消息
    2. 纯文件附件
    3. 文本 + 文件附件
    """
    # 构建响应内容
    reply_parts = []
    
    # 处理文本
    if text:
        reply_parts.append(f"收到文本消息: {text}")
    
    # 处理文件（使用公共服务）
    if attachments:
        file_info_list = await process_attachments(
            attachments=attachments,
            agent_id=agent_id,
            processor=process_attachment_dummy
        )
        
        # 保存到知识库
        for file_info in file_info_list:
            reply_parts.append(f"文件 {file_info.filename} 已保存到知识库")
            save_to_knowledge_base(file_info, agent_id)

    reply = "\n".join(reply_parts)

    return build_chat_response(
        reply=reply
    )

@router.get("/sessions")
async def get_sessions():
    """获取知识库会话列表（历史聊天）"""
    return load_sessions_list("kb")

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