"""
简单聊天 Agent 基类
适用于基于 LLM 对话的简单 Agent
"""
from typing import Optional, List, Dict, Any
from fastapi import UploadFile

from .base_agent import BaseAgent
from app.service.agent_chat_service import standard_chat


class SimpleChatAgent(BaseAgent):
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
    
        print("in simple_chat_agent", self.agent_id, self.system_prompt, text, session_id)
        return await standard_chat(
            agent_id=self.agent_id,
            system_prompt=self.system_prompt,
            text=text,
            session_id=session_id
        )
