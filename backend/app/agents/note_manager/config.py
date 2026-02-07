"""
Note Manager (笔记管理器) 专属配置
"""
from pathlib import Path
from app.core.config import get_agent_config, get_agent_data_dir, get_agent_chat_history_path

# Agent ID
AGENT_ID = "nm"

# 获取 Agent 配置
AGENT_CONFIG = get_agent_config(AGENT_ID)

# Agent 名称
AGENT_NAME = AGENT_CONFIG.get("name", "笔记管理器")

# Agent 数据目录
AGENT_DATA_DIR = get_agent_data_dir(AGENT_ID)

# 聊天历史文件路径
CHAT_HISTORY_PATH = get_agent_chat_history_path(AGENT_ID)

# 是否启用
ENABLED = AGENT_CONFIG.get("enabled", True)

