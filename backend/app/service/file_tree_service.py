from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException

from app.core.config import get_agent_workspace_dir


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).isoformat(timespec="seconds")


def _build_tree(dir_path: Path, rel: str = "") -> Dict[str, Any]:
    """递归构建 workspace 目录树。rel 为相对 workspace 根的路径（空串表示根）。"""
    node: Dict[str, Any] = {
        "id": rel or "root",
        "name": dir_path.name or "workspace",
        "type": "folder",
        "path": rel,
    }
    children: List[Dict[str, Any]] = []
    try:
        entries = sorted(dir_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except OSError:
        entries = []
    for entry in entries:
        child_rel = f"{rel}/{entry.name}" if rel else entry.name
        if entry.is_dir():
            children.append(_build_tree(entry, child_rel))
        else:
            stat = entry.stat()
            children.append({
                "id": child_rel,
                "name": entry.name,
                "type": "file",
                "path": child_rel,
                "size": stat.st_size,
                "modifiedAt": _iso(stat.st_mtime),
            })
    node["children"] = children
    return node


def build_workspace_tree(agent_id: str) -> Dict[str, Any]:
    """返回 agent workspace 根目录的递归目录树。"""
    return _build_tree(get_agent_workspace_dir(agent_id))


def read_workspace_file(agent_id: str, rel_path: str) -> str:
    """读取 workspace 内相对路径的文本文件内容（含路径越界防护 + 大小限制）。"""
    ws = get_agent_workspace_dir(agent_id).resolve()
    target = (ws / rel_path).resolve()
    try:
        target.relative_to(ws)
    except ValueError:
        raise HTTPException(status_code=400, detail="路径越界")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    if target.stat().st_size > 1_000_000:
        raise HTTPException(status_code=413, detail="文件过大")
    try:
        return target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        raise HTTPException(status_code=500, detail="读取失败")
