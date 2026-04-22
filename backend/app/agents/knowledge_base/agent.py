"""
知识库 Agent 核心逻辑
"""
from pathlib import Path
from typing import AsyncGenerator

from app.agents.base_agent import BaseAgent
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.agent_chat_service import save_chat_session
from app.service.file_service import process_attachments, process_pre_cached_attachments
from app.service.stream_service import build_stream_chunk, build_stream_done
from .knowledge_base_service import (
    process_and_parse,
    save_to_knowledge_base,
)

AGENT_ID = "kb"


class KnowledgeBaseAgent(BaseAgent):
    """知识库 Agent,用于管理和处理知识库文件"""
    
    def __init__(self):
        super().__init__(agent_id=AGENT_ID, system_prompt="")
    
    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        reply_parts = []

        if ctx.user_text:
            reply_parts.append(f"收到文本消息: {ctx.user_text}")

        # TODO: 需要从 context 或 mentions 中获取 kb_id
        # 目前知识库 Agent 的文件上传功能需要重构以支持多知识库
        kb_id = None  # 暂时设为 None，需要前端通过 mentions 或其他方式传递
        
        if not kb_id:
            reply_parts.append("错误：未指定目标知识库ID，无法保存文件。请先选择一个知识库。")
        elif ctx.resolved_attachment_paths:
            path_objs = [Path(p) for p in ctx.resolved_attachment_paths]
            file_info_list = await process_pre_cached_attachments(
                path_objs,
                self.agent_id,
                processor=lambda path, fn, ct: process_and_parse(
                    path, fn, ct, self.agent_id
                ),
            )
            for file_info in file_info_list:
                save_to_knowledge_base(file_info, self.agent_id, kb_id)
        elif ctx.attachments:
            file_info_list = await process_attachments(
                attachments=ctx.attachments,
                agent_id=self.agent_id,
                processor=lambda path, fn, ct: process_and_parse(
                    path, fn, ct, self.agent_id
                ),
            )
            for file_info in file_info_list:
                save_to_knowledge_base(file_info, self.agent_id, kb_id)

        reply = "\n".join(reply_parts)
        session_id = save_chat_session(self.agent_id, ctx.session_id, ctx.user_text, reply)

        yield build_stream_chunk(reply)
        yield build_stream_done(session_id=session_id)
