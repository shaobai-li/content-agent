"""
Agent 基类定义
提供统一的 Agent 接口和默认实现
"""
from abc import ABC, abstractmethod
from typing import AsyncGenerator
from app.runtime.agent_turn_context import AgentTurnContext


class BaseAgent(ABC):
    
    def __init__(self, agent_id: str, system_prompt: str = ""):
        self.agent_id = agent_id
        self.system_prompt = system_prompt

    def get_system_prompt_for_llm(self) -> str:
        """发往 LLM 的 system 内容：在静态 system_prompt 前动态附加本 agent 已发现技能的 XML 目录。"""
        from app.utils.skill_loader import prepend_skill_catalog_xml_to_system_prompt

        return prepend_skill_catalog_xml_to_system_prompt(self.system_prompt, self.agent_id)

    @abstractmethod
    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        """流式对话：接收已构建的 ctx，yield 行级 JSON（chunk / done 等）。"""
        raise NotImplementedError
        yield  # noqa: unreachable — 标记为 async generator 供子类覆盖

    def get_config_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "system_prompt": self.system_prompt
        }
