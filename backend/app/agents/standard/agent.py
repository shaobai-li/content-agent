"""标准 Agent：单轮上下文 + 流式 LLM，与 `standard_chat_stream_from_context` 对齐。"""
from pathlib import Path
from typing import AsyncGenerator

from app.agents.base_agent import BaseAgent
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.agent_chat_service import standard_chat_stream_from_context

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_default_system_prompt() -> str:
    path = _PROMPTS_DIR / "system.md"
    return path.read_text(encoding="utf-8").strip()


class StandardAgent(BaseAgent):
    """通过 `agent_id` 与 `system_prompt` 区分实例；流式逻辑统一走标准聊天管线。"""

    def __init__(self, agent_id: str, system_prompt: str):
        super().__init__(agent_id=agent_id, system_prompt=system_prompt)

    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        async for chunk in standard_chat_stream_from_context(ctx, self.system_prompt):
            yield chunk
