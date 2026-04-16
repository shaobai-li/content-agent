from typing import AsyncGenerator, List, Dict, Any
from pathlib import Path

from app.agents.base_agent import BaseAgent
from app.runtime.agent_turn_context import AgentTurnContext
from app.utils.skill_loader import bundled_skills_dir, load_skill_body
from app.utils.llm_client import deepseek_chat_stream
from app.service.agent_chat_service import save_chat_session
from app.utils.article_parser import extract_article_content
from app.service.stream_service import build_stream_done
from app.utils.context_utils import get_article_context_messages
from app.utils.xml_stream_parser import XmlStreamParser

_PROMPT_PATH = Path(__file__).parent / "prompts" / "system.md"
AGENT_ID = "w"


class WriteAgent(BaseAgent):
    """写作 Agent,用于辅助内容创作和写作"""
    
    def __init__(self):
        system_prompt = _PROMPT_PATH.read_text(encoding="utf-8").strip()
        super().__init__(
            agent_id=AGENT_ID,
            system_prompt=system_prompt
        )
    
    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        """写作 Agent 的流式输出：使用 XML 解析器的四阶段结构。"""
        import uuid

        system_prompt = self.get_system_prompt_for_llm()
        _skills_root = bundled_skills_dir()
        draft_skill = load_skill_body(_skills_root, "article-draft-generator")
        refine_skill = load_skill_body(_skills_root, "article-critic-refiner")

        run_id = uuid.uuid4().hex
        cache_dir = Path("test/cache")
        cache_dir.mkdir(parents=True, exist_ok=True)

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": draft_skill},
        ]

        article_messages = get_article_context_messages(ctx.mentions)
        messages.extend(article_messages)

        messages.append({"role": "user", "content": ctx.user_text})

        # 第一阶段：生成大纲(plan)，使用 XML 解析器
        plan_parts: List[str] = []
        plan_parser = XmlStreamParser(emit_plain_text=True)
        async for token in deepseek_chat_stream(messages=messages):
            plan_parts.append(token)
            plan_parser.feed(token)
            for event in plan_parser.get_events():
                yield event.to_stream_line()

        # 流结束，处理剩余内容
        for event in plan_parser.finalize():
            yield event.to_stream_line()

        plan_reply = "".join(plan_parts)
        plan_path = cache_dir / f"plan_{run_id}.md"
        plan_path.write_text(plan_reply, encoding="utf-8")

        messages.append({"role": "assistant", "content": plan_reply})

        # 第二阶段：根据大纲生成执行稿(execution)，使用 XML 解析器
        execution_parts: List[str] = []
        execution_parser = XmlStreamParser(emit_plain_text=True)
        async for token in deepseek_chat_stream(messages=messages):
            execution_parts.append(token)
            execution_parser.feed(token)
            for event in execution_parser.get_events():
                yield event.to_stream_line()

        for event in execution_parser.finalize():
            yield event.to_stream_line()

        execution_reply = "".join(execution_parts)
        execute_path = cache_dir / f"excute_{run_id}.md"
        execute_path.write_text(execution_reply, encoding="utf-8")

        reply = execution_reply
        session_id = save_chat_session(AGENT_ID, ctx.session_id, ctx.user_text, reply)

        article_content = extract_article_content(reply)

        # 第三阶段：Refine文章(plan)，使用 XML 解析器
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": refine_skill},
        ]

        messages.extend(article_messages)
        messages.append({"role": "user", "content": execution_reply})

        refine_plan_parts: List[str] = []
        refine_plan_parser = XmlStreamParser(emit_plain_text=True)
        async for token in deepseek_chat_stream(messages=messages):
            refine_plan_parts.append(token)
            refine_plan_parser.feed(token)
            for event in refine_plan_parser.get_events():
                yield event.to_stream_line()

        for event in refine_plan_parser.finalize():
            yield event.to_stream_line()

        refine_plan_reply = "".join(refine_plan_parts)
        refine_plan_path = cache_dir / f"refine_plan_{run_id}.md"
        refine_plan_path.write_text(refine_plan_reply, encoding="utf-8")

        messages.append({"role": "assistant", "content": refine_plan_reply})

        # 第四阶段：Refine文章(execution)，使用 XML 解析器
        refine_execution_parts: List[str] = []
        refine_execution_parser = XmlStreamParser(emit_plain_text=True)
        async for token in deepseek_chat_stream(messages=messages):
            refine_execution_parts.append(token)
            refine_execution_parser.feed(token)
            for event in refine_execution_parser.get_events():
                yield event.to_stream_line()

        for event in refine_execution_parser.finalize():
            yield event.to_stream_line()

        refine_execution_reply = "".join(refine_execution_parts)
        refine_execution_path = cache_dir / f"refine_execution_{run_id}.md"
        refine_execution_path.write_text(refine_execution_reply, encoding="utf-8")

        article_content = extract_article_content(refine_execution_reply)

        extra: Dict[str, Any] = {}
        if article_content:
            extra["article"] = article_content

        yield build_stream_done(session_id=session_id, extra=extra or None)