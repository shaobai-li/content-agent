from fastapi import APIRouter, File, UploadFile, Form
from typing import Optional, List
from pydantic import BaseModel
from app.core.config import get_agent_knowledge_base_path, CACHE_DIR
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response
import json
import uuid
from pathlib import Path

router = APIRouter()

async def process_attachment_dummy(file_path: Path, filename: str, content_type: str) -> str:
    """
    附件处理的 dummy 实现
    后续可以根据文件类型调用不同的解析器
    """
    # 这里是占位符，将来可以实现真正的文件解析逻辑
    return f"已处理文件: {filename} (类型: {content_type})"

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "kb"

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
    
    # 处理文件
    if attachments:
        # 为当前 agent 创建缓存子目录
        agent_cache_dir = CACHE_DIR / agent_id
        agent_cache_dir.mkdir(parents=True, exist_ok=True)
        
        file_info = []
        for file in attachments:
            # 1. 缓存文件到磁盘
            file_ext = Path(file.filename).suffix if file.filename else ""
            cached_filename = f"{uuid.uuid4()}{file_ext}"
            cached_path = agent_cache_dir / cached_filename
            
            # 保存文件
            content = await file.read()
            with open(cached_path, "wb") as f:
                f.write(content)
            
            # 2. 调用 dummy 处理模块
            process_result = await process_attachment_dummy(
                cached_path, 
                file.filename, 
                file.content_type
            )
            
            file_info.append({
                "filename": file.filename,
                "content_type": file.content_type,
                "size": len(content),
                "cached_path": str(cached_path),
                "process_result": process_result
            })
        
        file_names = [f["filename"] for f in file_info]
        reply_parts.append(f"收到 {len(attachments)} 个文件: {', '.join(file_names)}")
        
        # 添加处理结果
        for info in file_info:
            reply_parts.append(f"  - {info['process_result']}")
    
    # 如果既没有文本也没有文件
    if not reply_parts:
        reply_parts.append("未收到任何内容")
    
    reply = "\n".join(reply_parts)
    
    # 使用公共服务构建响应
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

