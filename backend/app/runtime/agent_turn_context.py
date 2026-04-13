"""
单轮 Agent 输入上下文（AgentTurnContext）。

目标与边界
----------
承载：标识本会话的 agent、可选 session、已解析的 mentions、合并 mention 后的用户可见文本、
原始上传附件句柄、从存储加载的本会话历史消息（持久化层结构）。

不承载：system prompt、最终发给模型的完整 messages 列表、工具/ReAct 中间状态；
这些由各 agent 或 DecisionLoop 在内部根据业务拼装。

持久化：本类型只描述「本轮进入时的输入」。写入会话仍由循环结束后调用方调用
``save_chat_session``（或等价逻辑）完成，不在此处执行。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from app.service.messages_service import load_messages
from app.utils.context_utils import parse_mentions, build_user_message_with_mentions


@dataclass(frozen=True)
class AgentTurnContext:
    """一轮 chat 请求在后端侧的规范化输入快照（非 LLM 最终上下文）。"""

    agent_id: str
    session_id: Optional[str]
    mentions: List[Dict[str, Any]]
    user_text: str
    attachments: Optional[List[UploadFile]]
    history_messages: List[Dict[str, Any]]


def build_agent_turn_context(
    agent_id: str,
    *,
    text: Optional[str] = None,
    session_id: Optional[str] = None,
    mentions: Optional[str] = None,
    attachments: Optional[List[UploadFile]] = None,
) -> AgentTurnContext:
    """
    从 HTTP 表单等价参数构造本轮上下文：解析 mentions、生成 user_text、按需加载历史。

    ``history_messages`` 与 ``load_messages`` 返回一致（含 message_id、created_at 等字段）；
    拼 LLM messages 时请只使用其中 ``role`` / ``content``，与现有 ``standard_chat`` 用法一致。
    """
    mentions_list = parse_mentions(mentions)
    user_text = build_user_message_with_mentions(text or "", mentions_list)
    history = load_messages(agent_id, session_id) if session_id else []

    return AgentTurnContext(
        agent_id=agent_id,
        session_id=session_id,
        mentions=mentions_list,
        user_text=user_text,
        attachments=attachments,
        history_messages=history,
    )
