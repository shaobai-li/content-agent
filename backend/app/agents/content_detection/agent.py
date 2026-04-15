"""内容检测 Agent"""
from typing import AsyncGenerator, Optional, List

from app.agents.base_agent import BaseAgent
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.agent_chat_service import standard_chat_stream_from_context

AGENT_ID = "c"
SYSTEM_PROMPT = """你是一个专业的内容检测助手。你可以帮助用户识别文本中的风险内容、敏感表达和潜在违规点,并给出清晰可执行的修改建议。请用中文回复,语气专业且客观。"""


class ContentDetectionAgent(BaseAgent):
    
    def __init__(self):
        super().__init__(agent_id=AGENT_ID, system_prompt=SYSTEM_PROMPT)
    
    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        async for chunk in standard_chat_stream_from_context(ctx, self.system_prompt):
            yield chunk
