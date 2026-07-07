"""Agent 配置管理 API：prompts 读写、skills 管理。"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Body, HTTPException
from loguru import logger

from app.core.config import get_agent_base_dir
from app.utils.skill_loader import discover_skills_for_agent, SkillHead
from app.utils.disabled_skills import DisabledSkills

router = APIRouter(prefix="/api/agents/{agent_id}", tags=["agent-config"])

# ── 允许前端编辑的 prompts 文件列表 ─────────────────────────────
ALLOWED_PROMPT_FILES = {"SYSTEM.md", "SOUL.md", "USER.md", "IDENTITY.md"}


def _agent_prompts_dir(agent_id: str) -> Path:
    """Agent 可写文件目录：agent 根目录。"""
    d = get_agent_base_dir(agent_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _agent_skills_dir(agent_id: str) -> Path:
    d = get_agent_base_dir(agent_id) / ".agent" / "skills"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Prompts ──────────────────────────────────────────────────────


@router.get("/prompts")
async def list_prompts(agent_id: str):
    """返回 prompts 目录下所有可编辑文件的内容。"""
    prompts_dir = _agent_prompts_dir(agent_id)
    result: Dict[str, str] = {}
    for filename in ALLOWED_PROMPT_FILES:
        path = prompts_dir / filename
        if path.is_file():
            result[filename] = path.read_text(encoding="utf-8")
        else:
            result[filename] = ""
    return {"files": result}


@router.put("/prompts/{filename:path}")
async def save_prompt(agent_id: str, filename: str, payload: dict = Body(...)):
    """保存 prompts 目录下的某个文件内容。"""
    if filename not in ALLOWED_PROMPT_FILES:
        raise HTTPException(status_code=400, detail=f"不允许的文件名: {filename}")

    content = payload.get("content")
    if content is None:
        raise HTTPException(status_code=400, detail="缺少 content 字段")
    if not isinstance(content, str):
        raise HTTPException(status_code=400, detail="content 必须是字符串")

    prompts_dir = _agent_prompts_dir(agent_id)
    path = prompts_dir / filename
    path.write_text(str(content), encoding="utf-8")
    logger.info("saved prompt: {} / {}", agent_id, filename)
    return {"ok": True, "path": str(path.resolve())}


# ── Skills ───────────────────────────────────────────────────────


def _skill_to_dict(head: SkillHead, disabled: DisabledSkills) -> dict:
    return {
        "id": head.skill_id,
        "name": head.name,
        "description": head.description,
        "source": head.source,
        "disabled": disabled.is_disabled(head.skill_id),
    }


@router.get("/skills")
async def list_skills(agent_id: str):
    """返回 agent 可用 skill 列表（bundled + user），含 disable 状态。"""
    disabled = DisabledSkills.load(agent_id)
    heads = discover_skills_for_agent(agent_id)
    return {"skills": [_skill_to_dict(h, disabled) for h in heads]}


@router.put("/skills/{skill_id}/disable")
async def toggle_skill_disable(agent_id: str, skill_id: str, payload: dict = Body(...)):
    """切换某个 skill 的 disable 状态。"""
    disabled_value = payload.get("disabled")
    if not isinstance(disabled_value, bool):
        raise HTTPException(status_code=400, detail="disabled 必须是布尔值")

    disabled = DisabledSkills.load(agent_id)
    disabled.set_disabled(skill_id, disabled_value)
    disabled.save(agent_id)
    logger.info("toggle skill disable: {} / {} → {}", agent_id, skill_id, disabled_value)
    return {"ok": True}


def _validate_upload_folder(folder_name: str, files: Dict[str, str]) -> str:
    """验证上传的 skill 文件夹内容，返回空串表示通过，否则返回错误原因。"""
    # 1. 只允许字母、数字、-
    import re
    if not re.match(r"^[a-zA-Z0-9\-]+$", folder_name):
        return "文件夹名只能包含字母、数字和 - 符号"

    # 2. 必须有 SKILL.md
    if "SKILL.md" not in files:
        return "缺少 SKILL.md 文件"

    # 3. 解析 YAML frontmatter
    content = files["SKILL.md"]
    if not content.startswith("---"):
        return "SKILL.md 必须以 YAML frontmatter 开头（---）"

    parts = content.split("---", 2)
    if len(parts) < 3:
        return "SKILL.md YAML frontmatter 格式错误"

    import yaml
    try:
        meta = yaml.safe_load(parts[1])
    except Exception as e:
        return f"SKILL.md YAML 解析失败: {e}"

    if not isinstance(meta, dict):
        return "SKILL.md YAML 头必须是键值对"

    name = meta.get("name")
    description = meta.get("description")
    if not name or not description:
        return "SKILL.md YAML 头缺少 name 或 description 字段"

    name_s = str(name).strip()
    if not name_s:
        return "SKILL.md YAML name 不能为空"

    # 4. name 必须与文件夹名一致
    if name_s != folder_name:
        return f"SKILL.md YAML name（{name_s}）与文件夹名（{folder_name}）不一致"

    return ""  # 验证通过


@router.post("/skills/upload")
async def upload_skill(agent_id: str, payload: dict = Body(...)):
    """上传一个 skill 文件夹到 agent 的 skills 目录。

    请求格式:
    ```json
    {
        "folder_name": "my-skill",
        "files": {
            "SKILL.md": "# YAML frontmatter + 正文",
            "scripts/tool.py": "..."
        }
    }
    ```
    """
    folder_name = (payload.get("folder_name") or "").strip()
    files: Dict[str, str] = payload.get("files") or {}

    error = _validate_upload_folder(folder_name, files)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # 写入文件
    skill_dir = _agent_skills_dir(agent_id) / folder_name
    if skill_dir.exists():
        raise HTTPException(status_code=409, detail=f"Skill {folder_name} 已存在")

    for rel_path, file_content in files.items():
        target = (skill_dir / rel_path).resolve()
        # 防止路径穿越
        if not str(target).startswith(str(skill_dir.resolve())):
            raise HTTPException(status_code=400, detail=f"非法路径: {rel_path}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(file_content, encoding="utf-8")

    logger.info("upload skill: {} / {} ({} files)", agent_id, folder_name, len(files))
    return {"ok": True, "path": str(skill_dir.resolve())}


@router.delete("/skills/{skill_id}")
async def delete_skill(agent_id: str, skill_id: str):
    """删除用户自定义 skill（仅 source=user 可删除）。"""
    # 检查该 skill 是否存在且为 user 来源
    heads = discover_skills_for_agent(agent_id)
    target = next((h for h in heads if h.skill_id == skill_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Skill {skill_id} 不存在")

    if target.source != "user":
        raise HTTPException(status_code=400, detail="built-in skill 不可删除")

    import shutil
    skill_dir = _agent_skills_dir(agent_id) / skill_id
    if skill_dir.is_dir():
        shutil.rmtree(skill_dir)
        logger.info("delete skill: {} / {}", agent_id, skill_id)

    # 清理 disable 状态
    disabled = DisabledSkills.load(agent_id)
    if disabled.is_disabled(skill_id):
        disabled.set_disabled(skill_id, False)
        disabled.save(agent_id)

    return {"ok": True}
