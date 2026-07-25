"""
单轮 Agent 输入上下文（AgentTurnContext）。

目标与边界
----------
承载：标识本会话的 agent、可选 session、已解析的 mentions、合并 mention 后的用户可见文本、
可选 multipart 附件句柄、可选已落盘的 cache 路径列表、从存储加载的本会话历史消息（持久化层结构）。

不承载：system prompt、最终发给模型的完整 messages 列表、工具/ReAct 中间状态；
这些由各 agent 或 DecisionLoop 在内部根据业务拼装。

持久化：本类型只描述「本轮进入时的输入」。写入会话由循环结束后调用方负责完成，
不在此处执行。
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from fastapi import UploadFile

from loguru import logger

from app.service.messages_service import load_messages
from app.service.file_service import resolve_validated_cache_paths
from app.utils.context_utils import (
    parse_mentions,
    build_user_message_with_mentions,
    append_attachments_to_user_text,
)


@dataclass(frozen=True)
class AgentTurnContext:
    """一轮 chat 请求在后端侧的规范化输入快照（非 LLM 最终上下文）。"""

    agent_id: str
    session_id: Optional[str]
    mentions: List[Dict[str, Any]]
    user_text: str
    attachments: Optional[List[UploadFile]]
    resolved_attachment_paths: Tuple[str, ...]  # 已校验的 cache 绝对路径，已并入 user_text 附件块
    history_messages: List[Dict[str, Any]]
    provider: Optional[str] = None  # LLM 供应商名称，如 "deepseek", "openai", "moonshot"
    model: Optional[str] = None  # LLM 模型名称，如 "deepseek-v4-flash", "gpt-4o", "kimi-k2.5"


def _parse_attachment_paths_json(raw: Optional[str]) -> List[str]:
    if not raw or not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    if isinstance(data, list):
        return [str(x) for x in data if isinstance(x, str)]
    return []


def build_agent_turn_context(
    agent_id: str,
    *,
    text: Optional[str] = None,
    session_id: Optional[str] = None,
    mentions: Optional[str] = None,
    attachments: Optional[List[UploadFile]] = None,
    attachment_paths: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> AgentTurnContext:
    """
    从 HTTP 表单等价参数构造本轮上下文：解析 mentions、生成 user_text、按需加载历史。

    ``history_messages`` 与 ``load_messages`` 返回一致（含 message_id、created_at 等字段）；
    拼 LLM messages 时请只使用其中 ``role`` / ``content``，与现有 ``standard_chat`` 用法一致。
    """
    mentions_list = parse_mentions(mentions)
    user_text = build_user_message_with_mentions(text or "", mentions_list)
    raw_paths = _parse_attachment_paths_json(attachment_paths)
    validated_paths = resolve_validated_cache_paths(agent_id, raw_paths)
    path_strings = tuple(str(p.resolve()) for p in validated_paths)
    user_text = append_attachments_to_user_text(user_text, list(path_strings))
    history = load_messages(agent_id, session_id) if session_id else []

    logger.debug("build context: {} session={} mentions={} attachments={} history={}",
                 agent_id, session_id, len(mentions_list), len(path_strings), len(history))

    return AgentTurnContext(
        agent_id=agent_id,
        session_id=session_id,
        mentions=mentions_list,
        user_text=user_text,
        attachments=attachments,
        resolved_attachment_paths=path_strings,
        history_messages=history,
        provider=provider,
        model=model,
    )
