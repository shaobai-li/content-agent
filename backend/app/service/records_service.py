"""
通用记录管理服务
提供跨 Agent 的记录读取、写入、删除功能
"""
from typing import List, Dict, Any
import json

from app.core.config import get_agent_knowledge_base_path


def get_all_records(agent_id: str) -> List[Dict[str, Any]]:
    """获取指定 Agent 的所有记录"""
    records = []
    records_path = get_agent_knowledge_base_path(agent_id)
    if records_path.exists():
        with open(records_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def delete_record(record_id: str, agent_id: str) -> Dict[str, Any]:
    """根据 record_id 删除指定 Agent 的记录"""
    records_path = get_agent_knowledge_base_path(agent_id)
    if not records_path.exists():
        return {"success": False, "message": "记录文件不存在"}

    remaining = []
    found = False
    with open(records_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            if record.get("record_id") == record_id:
                found = True
            else:
                remaining.append(record)

    if not found:
        return {"success": False, "message": f"记录 {record_id} 不存在"}

    with open(records_path, "w", encoding="utf-8") as f:
        for record in remaining:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return {"success": True, "message": f"记录 {record_id} 已删除"}
