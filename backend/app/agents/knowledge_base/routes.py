from fastapi import APIRouter, File, UploadFile, Form
from typing import Optional, List

from app.service.chat_service import build_chat_response
from app.service.file_service import process_attachments
from .knowledge_base_service import (
    process_and_parse,
    save_to_knowledge_base,
    get_all_records,
    delete_record as delete_kb_record
)

router = APIRouter()


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
            processor=lambda path, fn, ct: process_and_parse(path, fn, ct, agent_id)
        )
        
        # 保存到知识库
        for file_info in file_info_list:
            reply_parts.append(f"文件 {file_info.filename} 已保存到知识库")
            save_to_knowledge_base(file_info, agent_id)

    reply = "\n".join(reply_parts)

    return build_chat_response(
        reply=reply
    )

@router.get("/records")
async def get_records():
    """获取知识库记录"""
    records = get_all_records("kb")
    return {"records": records}


@router.delete("/records/{record_id}")
async def delete_record(record_id: str):
    """根据 record_id 删除知识库记录"""
    return delete_kb_record(record_id, "kb")