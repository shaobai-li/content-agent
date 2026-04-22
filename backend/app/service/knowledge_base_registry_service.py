from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
from typing import Any, Dict, List, Optional

from app.core.config import get_agent_local_data_dir
from app.core.ids import new_uuid


DEFAULT_DATABASE_META: Dict[str, Dict[str, str]] = {
    "kb": {
        "name": "知识库数据库",
        "description": "点击进入当前知识库数据页",
    },
    "std": {
        "name": "标准数据库",
        "description": "点击进入当前知识库数据页",
    },
}


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _root_folder_node() -> Dict[str, Any]:
    now = _utc_iso()
    return {
        "id": "fld_root",
        "node_type": "folder",
        "name": "Root",
        "parent_id": None,
        "created_at": now,
        "updated_at": now,
    }


def _default_database_meta(agent_id: str) -> Dict[str, str]:
    return DEFAULT_DATABASE_META.get(
        agent_id,
        {
            "name": f"{agent_id.upper()} 数据库",
            "description": "点击进入当前知识库数据页",
        },
    )


def get_database_registry_path(agent_id: str) -> Path:
    return get_agent_local_data_dir(agent_id) / "databases.json"


def get_database_nodes_path(agent_id: str, kb_id: str) -> Path:
    """获取指定知识库的 nodes.json 文件路径"""
    if not kb_id or not kb_id.strip():
        raise ValueError(f"kb_id 不能为空，agent_id={agent_id}")
    return get_agent_local_data_dir(agent_id) / kb_id / "view" / "nodes.json"


def _default_kb_document(kb_id: str) -> Dict[str, Any]:
    return {
        "kb_id": kb_id,
        "version": 1,
        "nodes": [_root_folder_node()],
    }


def ensure_kb_document(agent_id: str, kb_id: str) -> Dict[str, Any]:
    """确保知识库文档存在并初始化"""
    if not kb_id or not kb_id.strip():
        raise ValueError(f"kb_id 不能为空，agent_id={agent_id}")
    path = get_database_nodes_path(agent_id, kb_id)
    path.parent.mkdir(parents=True, exist_ok=True)

    data: Dict[str, Any]
    if not path.exists():
        data = _default_kb_document(kb_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return data

    try:
        with open(path, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        data = loaded if isinstance(loaded, dict) else _default_kb_document(kb_id)
    except (json.JSONDecodeError, OSError, TypeError):
        data = _default_kb_document(kb_id)

    changed = False
    if data.get("kb_id") != kb_id:
        data["kb_id"] = kb_id
        changed = True
    if not isinstance(data.get("version"), int):
        data["version"] = 1
        changed = True

    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
        data["nodes"] = nodes
        changed = True

    has_root = any(isinstance(node, dict) and node.get("id") == "fld_root" for node in nodes)
    if not has_root:
        nodes.insert(0, _root_folder_node())
        changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return data


def _normalize_database_entry(entry: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None

    database_id = entry.get("id")
    name = entry.get("name")
    description = entry.get("description")
    if not isinstance(database_id, str) or not database_id.strip():
        return None
    if not isinstance(name, str) or not name.strip():
        return None

    return {
        "id": database_id.strip(),
        "name": name.strip(),
        "description": description.strip() if isinstance(description, str) else "",
        "created_at": entry.get("created_at") if isinstance(entry.get("created_at"), str) else _utc_iso(),
        "updated_at": entry.get("updated_at") if isinstance(entry.get("updated_at"), str) else _utc_iso(),
    }


def _save_database_registry(agent_id: str, databases: List[Dict[str, Any]]) -> None:
    path = get_database_registry_path(agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(databases, f, ensure_ascii=False, indent=2)


def ensure_database_registry(agent_id: str) -> List[Dict[str, Any]]:
    path = get_database_registry_path(agent_id)

    loaded_entries: List[Dict[str, Any]] = []
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, list):
                for entry in loaded:
                    normalized = _normalize_database_entry(entry)
                    if normalized:
                        loaded_entries.append(normalized)
        except (json.JSONDecodeError, OSError, TypeError):
            loaded_entries = []

    _save_database_registry(agent_id, loaded_entries)
    return loaded_entries


def list_knowledge_bases(agent_id: str) -> List[Dict[str, Any]]:
    return ensure_database_registry(agent_id)


def create_knowledge_base(name: str, description: str, agent_id: str) -> Dict[str, Any]:
    database_name = name.strip()
    database_description = description.strip()

    if not database_name:
        return {"success": False, "message": "知识库名称不能为空"}

    databases = ensure_database_registry(agent_id)

    existing_ids = {entry["id"] for entry in databases}
    kb_id = f"kb_{new_uuid()}"
    while kb_id in existing_ids:
        kb_id = f"kb_{new_uuid()}"

    now = _utc_iso()
    database = {
        "id": kb_id,
        "name": database_name,
        "description": database_description,
        "created_at": now,
        "updated_at": now,
    }

    ensure_kb_document(agent_id, kb_id)
    databases.append(database)
    _save_database_registry(agent_id, databases)

    return {"success": True, "database": database}


def delete_knowledge_base(agent_id: str, kb_id: str) -> Dict[str, Any]:
    database_id = kb_id.strip()
    if not database_id:
        return {"success": False, "message": "知识库不存在"}

    databases = ensure_database_registry(agent_id)
    database = next((entry for entry in databases if entry["id"] == database_id), None)
    if not database:
        return {"success": False, "message": "知识库不存在"}

    remaining_databases = [entry for entry in databases if entry["id"] != database_id]
    _save_database_registry(agent_id, remaining_databases)

    database_dir = get_agent_local_data_dir(agent_id) / database_id
    if database_dir.exists():
        shutil.rmtree(database_dir, ignore_errors=True)

    return {"success": True, "database": database}
