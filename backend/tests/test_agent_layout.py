"""Tests for agent layout defaults.

覆盖 PR #337 的行为变更：
- ``list_agents`` 原样返回 SYSTEM.md 声明的 layout，缺失时不兜底（删除页面即不再显示）；
- 显式声明的 layout 原样返回；
- ``create_agent`` 创建时将默认布局写入新自定义 agent 的 SYSTEM.md，且可被读回；
- 默认布局工厂函数每次返回新对象，避免共享可变引用污染全局默认。
"""
from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.api.agents import _default_agent_layout
from app.core.auth import _user_agents_var, _user_id_var
from app.core.config import parse_system_md_frontmatter

CUSTOM_LAYOUT = {
    "left": ["history"],
    "defaultLeft": "history",
    "right": ["chat"],
    "defaultRight": "chat",
}


# ── list_agents 原样返回 layout，不兜底 ────────────────────────────


@pytest.mark.asyncio
async def test_list_agents_returns_layout_verbatim_no_fallback():
    """list_agents 原样返回 SYSTEM.md 的 layout：缺失时不兜底，删了页面就没页面。"""
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

    # 未声明 layout → 返回 None，不注入默认布局
    assert agents["a_no_layout"]["layout"] is None
    # 显式声明 layout → 原样返回
    assert agents["a_with_layout"]["layout"] == CUSTOM_LAYOUT


@pytest.mark.asyncio
async def test_list_agents_system_agent_without_layout_returns_none():
    """系统 agent frontmatter 未声明 layout → 同样返回 None，不注入默认布局。"""
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
    assert agents["new_system_agent"]["layout"] is None


@pytest.mark.asyncio
async def test_list_agents_merges_user_workspace_system_md(tmp_path):
    """系统 agent 合并用户 workspace SYSTEM.md frontmatter；无用户上下文回退内置。"""
    import app.core.config as config_mod
    from app.api.agents import list_agents

    user_layout = {
        "left": ["history", "settings"],
        "defaultLeft": "settings",
        "right": ["chat"],
        "defaultRight": "chat",
    }
    original = config_mod.DEFAULT_DATA_DIR
    try:
        config_mod.DEFAULT_DATA_DIR = tmp_path
        # 模拟设置页保存后的状态：用户 workspace SYSTEM.md 覆盖了 title/description/locked/layout
        std_dir = tmp_path / "u_1" / "std"
        std_dir.mkdir(parents=True, exist_ok=True)
        (std_dir / "SYSTEM.md").write_text(
            "---\ntitle: 用户改的标题\ndescription: 用户描述\nname: std\nlocked: true\nlayout:\n"
            "  left: [history, settings]\n  defaultLeft: settings\n"
            "  right: [chat]\n  defaultRight: chat\n---\n\n正文",
            encoding="utf-8",
        )

        builtin = {
            "std": {
                "title": "内置标题",
                "description": "内置描述",
                "layout": {
                    "left": ["history"],
                    "defaultLeft": "history",
                    "right": ["chat"],
                    "defaultRight": "chat",
                },
            }
        }

        # 有用户上下文 → 合并生效（用户 workspace 优先）
        uid_token = _user_id_var.set("1")
        ua_token = _user_agents_var.set({})
        try:
            with patch("app.core.config.AGENTS_CONFIG", builtin):
                result = await list_agents()
        finally:
            _user_agents_var.reset(ua_token)
            _user_id_var.reset(uid_token)

        agents = {a["name"]: a for a in result["agents"]}
        assert agents["std"]["title"] == "用户改的标题"
        assert agents["std"]["description"] == "用户描述"
        assert agents["std"]["locked"] is True
        assert agents["std"]["layout"] == user_layout

        # 无用户上下文 → _read_user_system_meta 走 LookupError 分支，回退内置
        ua_token = _user_agents_var.set({})
        try:
            with patch("app.core.config.AGENTS_CONFIG", builtin):
                result = await list_agents()
        finally:
            _user_agents_var.reset(ua_token)

        agents = {a["name"]: a for a in result["agents"]}
        assert agents["std"]["title"] == "内置标题"
        assert agents["std"]["description"] == "内置描述"
        assert agents["std"]["locked"] is False
    finally:
        config_mod.DEFAULT_DATA_DIR = original


# ── create_agent 写入 layout ───────────────────────────────────────


def test_create_agent_writes_default_layout_to_system_md(tmp_path):
    """create_agent 将默认布局写入新 agent 的 SYSTEM.md，且可读回。"""
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
    assert meta["layout"] == _default_agent_layout()


def test_default_agent_layout_returns_fresh_objects():
    """工厂函数每次返回新对象，就地修改不会污染全局默认值。"""
    a = _default_agent_layout()
    b = _default_agent_layout()
    assert a is not b

    a["left"].append("document")
    assert "document" not in b["left"]
    assert _default_agent_layout()["left"] == ["history", "settings"]
