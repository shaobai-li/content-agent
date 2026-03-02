"""
写作 Agent
用于辅助内容创作和写作
"""
from typing import Optional, List, Dict, Any
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from app.service.agent_chat_service import standard_chat
from app.runtime.agent_registry import register_agent
from .agent import WriteAgent as WriteAgentCore

AGENT_ID = "w"


class WriteAgent(BaseAgent):
    """写作 Agent,集成了 WriteAgentCore 的功能"""
    
    def __init__(self):
        self.core = WriteAgentCore()
        super().__init__(
            agent_id=AGENT_ID,
            system_prompt=self.core.system_prompt
        )
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
        """处理写作请求"""
        print("in write_agent", self.agent_id, self.system_prompt, text, session_id)
        return await standard_chat(
            agent_id=self.agent_id,
            system_prompt=self.system_prompt,
            text=text,
            session_id=session_id,
            extra_response={"received": {"text": text}}
        )


# 创建并注册 agent 实例
write_agent = WriteAgent()
register_agent(write_agent)
