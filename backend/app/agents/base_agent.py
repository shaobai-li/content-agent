"""
Agent 基类定义
提供统一的 Agent 接口和默认实现
"""
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional, List, Dict, Any
from fastapi import UploadFile


class BaseAgent(ABC):
    
    def __init__(self, agent_id: str, system_prompt: str = ""):
        self.agent_id = agent_id
        self.system_prompt = system_prompt

    @abstractmethod
    async def handle_chat_stream(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None,
        mentions: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """流式对话：yield 行级 JSON（chunk / done 等），与 stream_service 协议一致。"""
        raise NotImplementedError
        yield  # noqa: unreachable — 标记为 async generator 供子类覆盖

    def get_config_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "system_prompt": self.system_prompt
        }
