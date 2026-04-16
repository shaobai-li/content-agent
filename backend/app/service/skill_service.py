"""Skill 加载：供 Agent 工具层调用，与 utils/skill_loader 的发现逻辑一致。"""

from __future__ import annotations

from app.utils.skill_loader import discover_skills_for_agent


def invoke_skill(agent_id: str, skill_id: str) -> str:
    """
    返回当前 Agent 已发现 skill 的 SKILL.md 全文（含 YAML frontmatter）。
    skill_id 必须出现在 discover_skills_for_agent 结果中（与系统提示词里 <skills> 目录一致）。
    """
    sid = (skill_id or "").strip()
    if not sid:
        return "Error: skill_id is required"
    for head in discover_skills_for_agent(agent_id):
        if head.skill_id == sid:
            try:
                return head.skill_md_path.read_text(encoding="utf-8")
            except OSError as e:
                return f"Error reading SKILL.md: {e}"
    return (
        f"Error: unknown or unavailable skill_id {sid!r} for this agent. "
        "Use an id from the <skills> block in the system prompt."
    )
