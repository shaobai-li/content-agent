from pathlib import Path
import yaml
from typing import Dict, Any

CONFIG_PATH = Path("config.yaml")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

# 全局数据目录
DATA_DIR = Path(config["DATA_DIR"])
RECORDS_FILE = DATA_DIR / "records.jsonl"

AGENTS_CONFIG: Dict[str, Dict[str, Any]] = config.get("agents", {})

def get_agent_config(agent_id: str) -> Dict[str, Any]:
    agent_config = AGENTS_CONFIG.get(agent_id, {})
    if not agent_config:
        raise ValueError(f"Agent '{agent_id}' 配置不存在")
    return agent_config


def get_agent_base_dir(agent_id: str) -> Path:
    agent_config = get_agent_config(agent_id)
    base_dir = Path(agent_config["base_dir"])
    # 确保目录存在
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def get_agent_sessions_path(agent_id: str) -> Path:
    base_dir = get_agent_base_dir(agent_id)
    agent_config = get_agent_config(agent_id)
    sessions_file = agent_config.get("sessions_file", "sessions.json")
    return base_dir / sessions_file


def get_agent_messages_path(agent_id: str) -> Path:
    base_dir = get_agent_base_dir(agent_id)
    agent_config = get_agent_config(agent_id)
    messages_file = agent_config.get("messages_file", "messages.json")
    return base_dir / messages_file