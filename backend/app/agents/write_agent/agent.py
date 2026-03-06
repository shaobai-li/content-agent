from typing import AsyncGenerator, Optional, List, Dict, Any
from pathlib import Path
from fastapi import UploadFile

from app.agents.base_agent import BaseAgent
from app.utils.skill_loader import load_skill
from app.utils.llm_client import deepseek_chat, deepseek_chat_stream
from app.service.agent_chat_service import save_chat_session
from app.utils.article_parser import extract_article_content
from app.service.stream_service import build_stream_chunk, build_stream_done
from app.utils.context_utils import parse_mentions, build_user_message_with_mentions, get_article_context_messages

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

        # 确保 test/cache 目录存在
        cache_dir = Path("test/cache")
        cache_dir.mkdir(parents=True, exist_ok=True)

        plan_reply = deepseek_chat(messages=messages)
        plan_path = cache_dir / f"plan_{run_id}.md"
        plan_path.write_text(plan_reply, encoding="utf-8")
        
        messages.append({"role": "assistant", "content": plan_reply})
        execution_reply = deepseek_chat(messages=messages)
        execute_path = cache_dir / f"excute_{run_id}.md"
        execute_path.write_text(execution_reply, encoding="utf-8")
        
        return execution_reply
    
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None,
        mentions: Optional[str] = None
    ) -> Dict[str, Any]:
        system_prompt = self.system_prompt
        draft_skill = load_skill(_SKILL_PATH,  "article-draft-generator")        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": draft_skill},
        ]
        
        mentions_list = parse_mentions(mentions)
        article_messages = get_article_context_messages(mentions_list)
        messages.extend(article_messages)
        
        user_text = build_user_message_with_mentions(text, mentions_list)
        messages.append({"role": "user", "content": user_text})

        reply = self.plan_and_execute(messages)

        # refine_skill = load_skill(_SKILL_PATH,  "article-critic-refiner")
        # messages = [
        #     {"role": "system", "content": system_prompt},
        #     {"role": "assistant", "content": refine_skill},
        #     {"role": "user", "content": reply}
        # ]
        
        # reply = self.plan_and_execute(messages) 

        session_id = save_chat_session(AGENT_ID, session_id, user_text, reply)
        
        article_content = extract_article_content(reply)
        response = {"reply": reply, "session_id": session_id}
        if article_content:
            response["article"] = article_content

        return response

    async def handle_chat_stream(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None,
        mentions: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """写作 Agent 的流式输出：保留"先规划再执行"的两阶段结构。"""
        import uuid

        system_prompt = self.system_prompt
        draft_skill = load_skill(_SKILL_PATH, "article-draft-generator")

        run_id = uuid.uuid4().hex
        cache_dir = Path("test/cache")
        cache_dir.mkdir(parents=True, exist_ok=True)

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": draft_skill},
        ]
        
        mentions_list = parse_mentions(mentions)
        article_messages = get_article_context_messages(mentions_list)
        messages.extend(article_messages)
        
        user_text = build_user_message_with_mentions(text or "", mentions_list)
        messages.append({"role": "user", "content": user_text})

        # 第一阶段：生成大纲(plan)，边生成边输出
        plan_parts: List[str] = []
        async for token in deepseek_chat_stream(messages=messages):
            plan_parts.append(token)
            yield build_stream_chunk(token)

        plan_reply = "".join(plan_parts)
        plan_path = cache_dir / f"plan_{run_id}.md"
        plan_path.write_text(plan_reply, encoding="utf-8")

        messages.append({"role": "assistant", "content": plan_reply})

        # 第二阶段：根据大纲生成执行稿(execution)，同样流式输出
        execution_parts: List[str] = []
        async for token in deepseek_chat_stream(messages=messages):
            execution_parts.append(token)
            yield build_stream_chunk(token)

        execution_reply = "".join(execution_parts)
        execute_path = cache_dir / f"excute_{run_id}.md"
        execute_path.write_text(execution_reply, encoding="utf-8")

        reply = execution_reply
        session_id = save_chat_session(AGENT_ID, session_id, user_text, reply)

        article_content = extract_article_content(reply)
        extra: Dict[str, Any] = {}
        if article_content:
            extra["article"] = article_content

        yield build_stream_done(session_id=session_id, extra=extra or None)