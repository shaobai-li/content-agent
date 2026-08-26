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


def write_workspace_file(agent_id: str, rel_path: str, content: str) -> Dict[str, Any]:
    """写入 workspace 内相对路径的文本文件内容（覆盖）。含越界防护 + 大小限制。"""
    ws = get_agent_workspace_dir(agent_id).resolve()
    target = (ws / rel_path).resolve()
    try:
        target.relative_to(ws)
    except ValueError:
        raise HTTPException(status_code=400, detail="路径越界")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    data = content.encode("utf-8")
    if len(data) > 1_000_000:
        raise HTTPException(status_code=413, detail="文件过大")
    try:
        target.write_bytes(data)
    except OSError:
        raise HTTPException(status_code=500, detail="写入失败")
    stat = target.stat()
    return {
        "ok": True,
        "path": rel_path,
        "size": stat.st_size,
        "modifiedAt": _iso(stat.st_mtime),
    }


def move_workspace_file(agent_id: str, source: str, target_dir: str) -> Dict[str, Any]:
    """移动 workspace 内文件/文件夹到目标目录。target_dir 为空或 "." 表示工作区根。"""
    ws = get_agent_workspace_dir(agent_id).resolve()
    src = (ws / source).resolve()
    trimmed = target_dir.strip()
    dst_dir = (ws / trimmed).resolve() if trimmed and trimmed != "." else ws
    # 越界防护：source 与 target_dir 都必须在 workspace 内
    for p in (src, dst_dir):
        try:
            p.relative_to(ws)
        except ValueError:
            raise HTTPException(status_code=400, detail="路径越界")
    if not src.exists():
        raise HTTPException(status_code=404, detail="源文件不存在")
    if not dst_dir.is_dir():
        raise HTTPException(status_code=400, detail="目标必须是目录")
    # 循环防护：不能把文件夹移入自身或子目录
    if src.is_dir():
        try:
            dst_dir.relative_to(src)
        except ValueError:
            pass
        else:
            raise HTTPException(status_code=400, detail="不能移入自身或子目录")
    dst = dst_dir / src.name
    if dst == src:
        raise HTTPException(status_code=400, detail="目标位置不变")
    if dst.exists():
        raise HTTPException(status_code=409, detail="目标已存在同名文件或文件夹")
    try:
        src.rename(dst)
    except OSError:
        raise HTTPException(status_code=500, detail="移动失败")
    # as_posix()：统一为 `/` 分隔（Windows 下 relative_to 返回反斜杠，与前端/树结构不一致）
    return {"ok": True, "from": source, "to": dst.relative_to(ws).as_posix()}
