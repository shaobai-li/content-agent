from typing import Optional, List, Dict, Any
from pathlib import Path
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from app.service.agent_chat_service import standard_chat
from app.utils.skill_loader import load_skill
from app.utils.llm_client import deepseek_chat
from app.service.agent_chat_service import save_chat_session
from app.utils.article_parser import extract_article_content

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
    
    def plan_and_execute(self, messages: List[Dict[str, str]]) -> str:
        """Plan and execute workflow: generate plan then execute"""
        import uuid

        # Generate a unique id for filenames to distinguish for each run
        run_id = uuid.uuid4().hex

        plan_reply = deepseek_chat(messages=messages)
        plan_path = Path(f"plan_{run_id}.md")
        plan_path.write_text(plan_reply, encoding="utf-8")
        
        messages.append({"role": "assistant", "content": plan_reply})
        execution_reply = deepseek_chat(messages=messages)
        execute_path = Path(f"excute_{run_id}.md")
        execute_path.write_text(execution_reply, encoding="utf-8")
        
        return execution_reply
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
        system_prompt = self.system_prompt
        draft_skill = load_skill(_SKILL_PATH,  "article-draft-generator")        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": draft_skill},
            {"role": "user", "content": text}
        ]

        reply = self.plan_and_execute(messages)

        # refine_skill = load_skill(_SKILL_PATH,  "article-critic-refiner")
        # messages = [
        #     {"role": "system", "content": system_prompt},
        #     {"role": "assistant", "content": refine_skill},
        #     {"role": "user", "content": reply}
        # ]
        
        # reply = self.plan_and_execute(messages) 

        session_id = save_chat_session(AGENT_ID, session_id, text, reply)
        
        article_content = extract_article_content(reply)
        response = {"reply": reply, "session_id": session_id}
        if article_content:
            response["article"] = article_content

        return response