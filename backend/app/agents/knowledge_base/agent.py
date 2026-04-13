"""
知识库 Agent 核心逻辑
"""
from typing import AsyncGenerator, Optional, List
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from app.service.agent_chat_service import save_chat_session
from app.service.file_service import process_attachments
from app.service.stream_service import build_stream_chunk, build_stream_done
from .knowledge_base_service import (
    process_and_parse,
    save_to_knowledge_base,
)

AGENT_ID = "kb"


class KnowledgeBaseAgent(BaseAgent):
    """知识库 Agent,用于管理和处理知识库文件"""
    
    def __init__(self):
        super().__init__(agent_id=AGENT_ID, system_prompt="")
    
    async def handle_chat_stream(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None,
        mentions: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        reply_parts = []

        if text:
            reply_parts.append(f"收到文本消息: {text}")

        if attachments:
            file_info_list = await process_attachments(
                attachments=attachments,
                agent_id=self.agent_id,
                processor=lambda path, fn, ct: process_and_parse(
                    path, fn, ct, self.agent_id
                )
            )
            for file_info in file_info_list:
                save_to_knowledge_base(file_info, self.agent_id)

        reply = "\n".join(reply_parts)
        session_id = save_chat_session(self.agent_id, session_id, text, reply)

        yield build_stream_chunk(reply)
        yield build_stream_done(session_id=session_id)
