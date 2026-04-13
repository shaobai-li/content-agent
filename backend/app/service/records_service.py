"""
通用记录管理服务
提供跨 Agent 的记录读取、写入、删除功能
"""
from typing import List, Dict, Any
from datetime import datetime, timezone
import json

from app.core.config import get_agent_knowledge_base_path
from app.core.ids import new_uuid


def get_all_records(agent_id: str) -> List[Dict[str, Any]]:
    """获取指定 Agent 知识库 nodes.json 中的完整节点列表（含 folder 与 record）"""
    path = get_agent_knowledge_base_path(agent_id)
    if not path.exists():
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("nodes"), list):
            return data["nodes"]
    except (json.JSONDecodeError, OSError, TypeError):
        pass
    return []


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


def create_folder(name: str, agent_id: str, parent_id: str = "fld_root") -> Dict[str, Any]:
    """在 nodes.json 中创建 folder 节点"""
    folder_name = name.strip()
    if not folder_name:
        return {"success": False, "message": "文件夹名称不能为空"}

    path = get_agent_knowledge_base_path(agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return {"success": False, "message": "记录文件不存在或无法解析"}
        if not isinstance(data, dict):
            data = {"kb_id": "kb_auto_generated", "version": 1, "nodes": []}
    else:
        data = {"kb_id": "kb_auto_generated", "version": 1, "nodes": []}

    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
        data["nodes"] = nodes

    if not any(isinstance(node, dict) and node.get("id") == "fld_root" for node in nodes):
        nodes.insert(0, _root_folder_node())

    now = _utc_iso()
    folder_node = {
        "id": f"fld_{new_uuid()}",
        "node_type": "folder",
        "name": folder_name,
        "parent_id": parent_id,
        "created_at": now,
        "updated_at": now,
    }
    nodes.append(folder_node)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "folder": folder_node}


def delete_record(record_id: str, agent_id: str) -> Dict[str, Any]:
    """根据 record_id 从 nodes.json 中删除对应 record 节点"""
    path = get_agent_knowledge_base_path(agent_id)
    if not path.exists():
        return {"success": False, "message": "记录文件不存在"}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"success": False, "message": "记录文件不存在或无法解析"}

    if not isinstance(data, dict):
        return {"success": False, "message": "记录文件不存在或无法解析"}

    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        return {"success": False, "message": "记录文件不存在或无法解析"}

    new_nodes: List[Dict[str, Any]] = []
    found = False
    for n in nodes:
        if (
            isinstance(n, dict)
            and n.get("node_type") == "record"
            and n.get("record_id") == record_id
        ):
            found = True
        else:
            new_nodes.append(n)

    if not found:
        return {"success": False, "message": f"记录 {record_id} 不存在"}

    data["nodes"] = new_nodes
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "message": f"记录 {record_id} 已删除"}
