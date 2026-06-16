from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

import yaml

from app.core.config import OMNIAGE_ROOT, get_agent_base_dir, get_agent_skill_ids
from app.utils.disabled_skills import DisabledSkills


def _xml_text(s: str) -> str:
    """XML 元素文本转义（&, <, >）。"""
    return escape(s, entities={'"': "&quot;", "'": "&apos;"})


@dataclass(frozen=True)
class SkillHead:
    """SKILL.md 发现阶段：仅 frontmatter + 路径，不含正文。"""

    skill_id: str
    source: str  # "bundled" | "user"
    name: str
    description: str
    skill_md_path: Path


def bundled_skills_dir() -> Path:
    """仓库内官方 skill 根目录：<OMNIAGE_ROOT>/config/agents/skills/<skill_id>/SKILL.md"""
    return OMNIAGE_ROOT / "config" / "agents" / "skills"


def parse_skill_frontmatter(skill_md_path: Path) -> Optional[Dict[str, Any]]:
    content = skill_md_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return None
    parts = content.split("---", 2)
    if len(parts) < 3:
        return None
    meta = yaml.safe_load(parts[1])
    if not isinstance(meta, dict):
        return None
    return meta


def read_skill_head(skill_id: str, skill_md_path: Path, source: str) -> Optional[SkillHead]:
    meta = parse_skill_frontmatter(skill_md_path)
    if not meta:
        return None
    name = meta.get("name")
    description = meta.get("description")
    if name is None or description is None:
        return None
    name_s, desc_s = str(name).strip(), str(description).strip()
    if not name_s or not desc_s:
        return None
    return SkillHead(
        skill_id=skill_id,
        source=source,
        name=name_s,
        description=desc_s,
        skill_md_path=skill_md_path,
    )


def load_skill_body(skill_root: Path, skill_id: str) -> str:
    """加载 SKILL.md 正文（去掉 YAML 头）。"""
    skill_file = skill_root / skill_id / "SKILL.md"
    content = skill_file.read_text(encoding="utf-8")
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return content.strip()


def load_skill(skill_path: Path, skill_name: str) -> str:
    """兼容旧接口：等价于 load_skill_body。"""
    return load_skill_body(skill_path, skill_name)


def discover_skills_for_agent(agent_id: str, disabled_skills: set[str] | None = None) -> List[SkillHead]:
    """
    发现某 agent 可用 skill：仅解析各 SKILL.md 的 frontmatter。
    顺序：config 中 skills 列表顺序；再追加用户目录下（仅不在该列表中的 skill_id，字母序）。
    同名 skill_id：用户目录覆盖仓库内条目。
    disabled_skills 中的 skill_id 会被跳过（不加入返回列表）。
    """
    disabled = disabled_skills or set()
    bundled_root = bundled_skills_dir()
    merged: Dict[str, SkillHead] = {}
    ordered: List[str] = []

    for skill_id in get_agent_skill_ids(agent_id):
        if skill_id in disabled:
            continue
        p = bundled_root / skill_id / "SKILL.md"
        if not p.is_file():
            continue
        head = read_skill_head(skill_id, p, "bundled")
        if head:
            merged[skill_id] = head
            ordered.append(skill_id)

    user_root = get_agent_base_dir(agent_id) / ".agent" / "skills"
    user_only: List[str] = []
    if user_root.is_dir():
        for sub in sorted(user_root.iterdir()):
            if not sub.is_dir():
                continue
            sid = sub.name
            if sid in disabled:
                continue
            sm = sub / "SKILL.md"
            if not sm.is_file():
                continue
            head = read_skill_head(sid, sm, "user")
            if not head:
                continue
            merged[sid] = head
            if sid not in ordered:
                user_only.append(sid)

    out: List[SkillHead] = []
    for sid in ordered:
        if sid in merged:
            out.append(merged[sid])
    for sid in sorted(user_only):
        out.append(merged[sid])
    return out


def format_skills_discovery_xml(heads: List[SkillHead]) -> str:
    """
    将发现的 SKILL 头信息序列化为一段 XML（供模型解析）。
    每个 skill 含：id、source、name、description、path（SKILL.md 绝对路径）。
    """
    if not heads:
        return ""
    parts = ["<skills>"]
    for h in heads:
        path_str = str(h.skill_md_path.resolve())
        parts.append(
            f'  <skill id="{_xml_text(h.skill_id)}" source="{_xml_text(h.source)}">'
        )
        parts.append(f"    <name>{_xml_text(h.name)}</name>")
        parts.append(f"    <description>{_xml_text(h.description)}</description>")
        parts.append(f"    <path>{_xml_text(path_str)}</path>")
        parts.append("  </skill>")
    parts.append("</skills>")
    return "\n".join(parts)


def discover_skills_xml_for_agent(agent_id: str) -> str:
    """发现某 agent 可用 skill（含 disable 过滤），返回仅含头信息的 XML 字符串；无 skill 时返回空串。"""
    disabled = DisabledSkills.load(agent_id)
    return format_skills_discovery_xml(
        discover_skills_for_agent(agent_id, disabled_skills=disabled.skill_ids)
    )


def prepend_skill_catalog_xml_to_system_prompt(base_system_prompt: str, agent_id: str) -> str:
    """
    将技能目录 XML 动态置于 system prompt 最前；无可用 skill 时等价于 base_system_prompt。
    """
    xml_block = discover_skills_xml_for_agent(agent_id).strip()
    base = (base_system_prompt or "").strip()
    if not xml_block:
        return base_system_prompt if base_system_prompt else ""
    if not base:
        return xml_block
    return f"{xml_block}\n\n{base}"


def format_skill_catalog_lines(heads: List[SkillHead]) -> str:
    """拼成给模型看的技能目录（仅头信息）。"""
    lines = []
    for h in heads:
        lines.append(f"[{h.source}] {h.skill_id} — {h.name}: {h.description}")
    return "\n".join(lines)
