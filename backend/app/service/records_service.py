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


def rename_node(node_id: str, name: str, agent_id: str) -> Dict[str, Any]:
    """根据节点标识更新 nodes.json 中对应节点的名称"""
    node_name = name.strip()
    if not node_name:
        return {"success": False, "message": "名称不能为空"}

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

    target_node = next(
        (
            node
            for node in nodes
            if isinstance(node, dict)
            and (
                node.get("id") == node_id
                or (node.get("node_type") == "record" and node.get("record_id") == node_id)
            )
        ),
        None,
    )

    if not isinstance(target_node, dict):
        return {"success": False, "message": f"节点 {node_id} 不存在"}

    if target_node.get("id") == "fld_root":
        return {"success": False, "message": "根目录不允许重命名"}

    target_node["name"] = node_name
    target_node["updated_at"] = _utc_iso()

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "node": target_node}


def move_node(node_id: str, parent_id: str, agent_id: str) -> Dict[str, Any]:
    """根据节点标识更新 nodes.json 中对应节点的父目录"""
    target_parent_id = parent_id.strip() or "fld_root"

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

    target_node = next(
        (
            node
            for node in nodes
            if isinstance(node, dict)
            and (
                node.get("id") == node_id
                or (node.get("node_type") == "record" and node.get("record_id") == node_id)
            )
        ),
        None,
    )

    if not isinstance(target_node, dict):
        return {"success": False, "message": f"节点 {node_id} 不存在"}

    if target_node.get("id") == "fld_root":
        return {"success": False, "message": "根目录不允许移动"}

    if target_parent_id != "fld_root":
        target_parent = next(
            (
                node
                for node in nodes
                if isinstance(node, dict)
                and node.get("id") == target_parent_id
                and node.get("node_type") == "folder"
            ),
            None,
        )
        if not isinstance(target_parent, dict):
            return {"success": False, "message": f"目标文件夹 {target_parent_id} 不存在"}

    current_parent_id = target_node.get("parent_id")
    if current_parent_id == target_parent_id:
        return {"success": True, "node": target_node}

    if target_node.get("node_type") == "folder":
        folder_id = target_node.get("id")
        if not isinstance(folder_id, str):
            return {"success": False, "message": "缺少可移动的文件夹标识"}

        children_by_parent: Dict[str, List[str]] = {}
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_parent_id = node.get("parent_id")
            node_self_id = node.get("id")
            if isinstance(node_parent_id, str) and isinstance(node_self_id, str):
                children_by_parent.setdefault(node_parent_id, []).append(node_self_id)

        descendant_ids = set()
        folder_ids_to_visit = [folder_id]
        while folder_ids_to_visit:
            current_folder_id = folder_ids_to_visit.pop()
            if not isinstance(current_folder_id, str) or current_folder_id in descendant_ids:
                continue
            descendant_ids.add(current_folder_id)
            folder_ids_to_visit.extend(children_by_parent.get(current_folder_id, []))

        if target_parent_id in descendant_ids:
            return {"success": False, "message": "文件夹不能移动到自身或子文件夹中"}

    target_node["parent_id"] = target_parent_id
    target_node["updated_at"] = _utc_iso()

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "node": target_node}


def delete_node(node_id: str, agent_id: str) -> Dict[str, Any]:
    """根据节点标识从 nodes.json 中删除对应节点，文件夹会级联删除子节点"""
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

    target_node = next(
        (
            node
            for node in nodes
            if isinstance(node, dict)
            and (
                node.get("id") == node_id
                or (node.get("node_type") == "record" and node.get("record_id") == node_id)
            )
        ),
        None,
    )

    if not isinstance(target_node, dict):
        return {"success": False, "message": f"节点 {node_id} 不存在"}

    if target_node.get("id") == "fld_root":
        return {"success": False, "message": "根目录不允许删除"}

    ids_to_delete = set()

    if target_node.get("node_type") == "folder":
        children_by_parent: Dict[str, List[str]] = {}
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_parent_id = node.get("parent_id")
            node_self_id = node.get("id")
            if isinstance(node_parent_id, str) and isinstance(node_self_id, str):
                children_by_parent.setdefault(node_parent_id, []).append(node_self_id)

        folder_ids_to_visit = [target_node.get("id")]
        while folder_ids_to_visit:
            current_folder_id = folder_ids_to_visit.pop()
            if not isinstance(current_folder_id, str) or current_folder_id in ids_to_delete:
                continue
            ids_to_delete.add(current_folder_id)
            folder_ids_to_visit.extend(children_by_parent.get(current_folder_id, []))
    else:
        target_record_id = target_node.get("record_id")
        if isinstance(target_record_id, str):
            ids_to_delete.add(target_record_id)
        target_id = target_node.get("id")
        if isinstance(target_id, str):
            ids_to_delete.add(target_id)

    new_nodes: List[Dict[str, Any]] = []
    for node in nodes:
        if not isinstance(node, dict):
            new_nodes.append(node)
            continue

        node_self_id = node.get("id")
        node_record_id = node.get("record_id")
        if node_self_id in ids_to_delete or node_record_id in ids_to_delete:
            continue

        new_nodes.append(node)

    data["nodes"] = new_nodes
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "message": f"节点 {node_id} 已删除"}
