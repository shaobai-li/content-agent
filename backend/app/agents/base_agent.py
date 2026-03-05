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
    async def handle_chat(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> Dict[str, Any]:
        pass

    async def handle_chat_stream(
        self,
        text: Optional[str] = None,
        session_id: Optional[str] = None,
        attachments: Optional[List[UploadFile]] = None
    ) -> AsyncGenerator[str, None]:
        """默认回退实现：调用 handle_chat，将整体结果包装成单块流返回。
        支持 LLM 流式的子类应覆盖此方法以获得逐 token 效果。"""
        from app.service.stream_service import build_stream_chunk, build_stream_done
        result = await self.handle_chat(text=text, session_id=session_id, attachments=attachments)
        reply = result.get("reply", "")
        sid = result.get("session_id", "")
        extra = {k: v for k, v in result.items() if k not in ("reply", "session_id")}
        yield build_stream_chunk(reply)
        yield build_stream_done(session_id=sid, extra=extra or None)

    def get_config_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "system_prompt": self.system_prompt
        }
