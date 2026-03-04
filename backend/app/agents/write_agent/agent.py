from typing import Optional, List, Dict, Any
from pathlib import Path
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from app.service.agent_chat_service import standard_chat
from app.utils.skill_loader import load_skill
from app.utils.llm_client import deepseek_chat
from app.service.agent_chat_service import save_chat_session

_PROMPT_PATH = Path(__file__).parent / "prompts" / "system.md"
_SKILL_PATH = Path(__file__).parent / "skills"
AGENT_ID = "w"


class WriteAgent(BaseAgent):
    """写作 Agent,用于辅助内容创作和写作"""
    
    def __init__(self):
        system_prompt = _PROMPT_PATH.read_text(encoding="utf-8").strip()
        super().__init__(
            agent_id=AGENT_ID,
            system_prompt=system_prompt
        )
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
        """处理写作请求"""
        return await standard_chat(
            agent_id=self.agent_id,
            system_prompt=self.system_prompt,
            text=text,
            session_id=session_id,
            extra_response={"received": {"text": text}}
        )

        # system_prompt = self.system_prompt
        # draft_skill = load_skill(_SKILL_PATH,  "article-draft-generator")
        
        # messages = [
        #     {"role": "system", "content": system_prompt},
        #     {"role": "assistant", "content": draft_skill},
        #     {"role": "user", "content": text}
        # ]

        # reply = deepseek_chat(messages=messages)
        # session_id = save_chat_session(AGENT_ID, session_id, text, reply)

        return {"reply": reply, "session_id": session_id}