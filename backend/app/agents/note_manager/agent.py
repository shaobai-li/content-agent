"""
笔记管理 Agent 核心逻辑
"""
from typing import Optional, List, Dict, Any
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from .agent_note_manager import NoteManager as NoteManagerCore

AGENT_ID = "nm"


class NoteManagerAgent(BaseAgent):
    """笔记管理 Agent,用于从URL抓取和管理笔记"""
    
    def __init__(self):
        super().__init__(agent_id=AGENT_ID, system_prompt="")
        self.core = NoteManagerCore()
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
        """处理笔记管理请求"""
        if not text:
            return {"reply": "请提供要处理的内容"}
        
        return await self.core.handle_user_message(text)
