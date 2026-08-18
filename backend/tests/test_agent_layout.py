"""Tests for agent layout defaults.

覆盖 PR #337 的行为变更：
- ``list_agents`` 对 frontmatter 未声明 layout 的 agent 兜底 ``DEFAULT_AGENT_LAYOUT``；
- 显式声明的 layout 原样返回；
- ``create_agent`` 将默认 layout 写入新自定义 agent 的 SYSTEM.md，且可被读回。
"""
from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.api.agents import DEFAULT_AGENT_LAYOUT
from app.core.auth import _user_agents_var, _user_id_var
from app.core.config import parse_system_md_frontmatter

CUSTOM_LAYOUT = {
    "left": ["history"],
    "defaultLeft": "history",
    "right": ["chat"],
    "defaultRight": "chat",
}


# ── list_agents 默认 layout 兜底 ───────────────────────────────────


@pytest.mark.asyncio
async def test_list_agents_falls_back_to_default_layout():
    """自定义 agent frontmatter 未声明 layout → 返回 DEFAULT_AGENT_LAYOUT。"""
    from app.api.agents import list_agents

    custom = {
        "a_no_layout": {"title": "无 layout"},
        "a_with_layout": {"title": "有 layout", "layout": CUSTOM_LAYOUT},
    }
    token = _user_agents_var.set(custom)
    try:
        with patch("app.core.config.AGENTS_CONFIG", {}):
            result = await list_agents()
    finally:
        _user_agents_var.reset(token)

    agents = {a["name"]: a for a in result["agents"]}

    # 未声明 layout → 兜底默认
    assert agents["a_no_layout"]["layout"] == DEFAULT_AGENT_LAYOUT
    # 显式声明 layout → 原样返回
    assert agents["a_with_layout"]["layout"] == CUSTOM_LAYOUT


@pytest.mark.asyncio
async def test_list_agents_system_agent_falls_back_when_layout_missing():
    """系统 agent frontmatter 未声明 layout（如未来新增的 agent）→ 同样兜底默认。"""
    from app.api.agents import list_agents

    token = _user_agents_var.set({})
    try:
        with patch(
            "app.core.config.AGENTS_CONFIG",
            {"new_system_agent": {"title": "新系统 agent"}},
        ):
            result = await list_agents()
    finally:
        _user_agents_var.reset(token)

    agents = {a["name"]: a for a in result["agents"]}
    assert agents["new_system_agent"]["layout"] == DEFAULT_AGENT_LAYOUT


# ── create_agent 写入 layout ───────────────────────────────────────


def test_create_agent_writes_default_layout_to_system_md(tmp_path):
    """create_agent 将 DEFAULT_AGENT_LAYOUT 写入新 agent 的 SYSTEM.md，且可读回。"""
    import app.core.config as config_mod
    from app.api.agents import create_agent

    original = config_mod.DEFAULT_DATA_DIR
    try:
        config_mod.DEFAULT_DATA_DIR = tmp_path
        uid_token = _user_id_var.set("1")
        try:
            result = asyncio.run(
                create_agent({"title": "测试智能体", "description": "描述"})
            )
            assert result["ok"] is True
            agent_id = result["agent"]["name"]
            assert agent_id.startswith("a_")
        finally:
            _user_id_var.reset(uid_token)
    finally:
        config_mod.DEFAULT_DATA_DIR = original

    system_md = tmp_path / "u_1" / agent_id / "SYSTEM.md"
    assert system_md.is_file()

    meta = parse_system_md_frontmatter(system_md)
    assert meta is not None
    assert meta["name"] == agent_id
    assert meta["title"] == "测试智能体"
    assert meta["description"] == "描述"
    assert meta["layout"] == DEFAULT_AGENT_LAYOUT
