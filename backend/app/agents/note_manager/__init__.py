"""
笔记管理 Agent
用于从URL抓取笔记内容(支持小红书、B站等平台)
"""
from app.runtime.agent_registry import register_agent
from .agent import NoteManagerAgent
from .routes import router

# 创建并注册 agent 实例
note_manager_agent = NoteManagerAgent()
register_agent(note_manager_agent)

# 导出路由供主应用使用
__all__ = ["note_manager_agent", "router"]
