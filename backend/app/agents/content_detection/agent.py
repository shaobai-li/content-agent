"""内容检测 Agent"""
from typing import Optional, List, Dict, Any
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from app.service.agent_chat_service import standard_chat

AGENT_ID = "c"
SYSTEM_PROMPT = """你是一个专业的内容检测助手。你可以帮助用户识别文本中的风险内容、敏感表达和潜在违规点,并给出清晰可执行的修改建议。请用中文回复,语气专业且客观。"""


class ContentDetectionAgent(BaseAgent):
    
    def __init__(self):
        super().__init__(agent_id=AGENT_ID, system_prompt=SYSTEM_PROMPT)
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
        
        return await standard_chat(
            agent_id=self.agent_id,
            system_prompt=self.system_prompt,
            text=text,
            session_id=session_id
        )
