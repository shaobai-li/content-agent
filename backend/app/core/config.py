import os
from pathlib import Path
import yaml
from typing import Dict, Any

from dotenv import load_dotenv
load_dotenv()

# 绝对路径：从 .env 读取
DATA_DIR = Path(os.getenv("DATA_DIR", ".")).resolve()

# 相对路径：从 yaml 读取
CONFIG_PATH = Path("config.yaml")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

RECORDS_FILE = DATA_DIR / "records.jsonl"

AGENTS_CONFIG: Dict[str, Dict[str, Any]] = config.get("agents", {})

def get_agent_config(agent_id: str) -> Dict[str, Any]:
    agent_config = AGENTS_CONFIG.get(agent_id, {})
    if not agent_config:
        raise ValueError(f"Agent '{agent_id}' 配置不存在")
    return agent_config


def get_agent_base_dir(agent_id: str) -> Path:
    agent_config = get_agent_config(agent_id)
    # base_dir 在 yaml 中为相对 DATA_DIR 的路径
    base_dir = (DATA_DIR / agent_config["base_dir"]).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    print(base_dir)
    return base_dir


def get_agent_sessions_path(agent_id: str) -> Path:
    base_dir = get_agent_base_dir(agent_id)
    agent_config = get_agent_config(agent_id)
    sessions_file = agent_config.get("sessions_file", "sessions.json")
    print()
    return base_dir / sessions_file


def get_agent_messages_path(agent_id: str) -> Path:
    base_dir = get_agent_base_dir(agent_id)
    agent_config = get_agent_config(agent_id)
    messages_file = agent_config.get("messages_file", "messages.json")
    return base_dir / messages_file


def get_agent_knowledge_base_path(agent_id: str) -> Path:
    base_dir = get_agent_base_dir(agent_id)
    agent_config = get_agent_config(agent_id)
    knowledge_base_file = agent_config.get("knowledge_base_file", "knowledge_base.jsonl")
    return base_dir / knowledge_base_file