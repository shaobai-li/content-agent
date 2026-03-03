"""
写作 Agent
用于辅助内容创作和写作
"""
from app.runtime.agent_registry import register_agent
from .agent import WriteAgent

# 创建并注册 agent 实例
write_agent = WriteAgent()
register_agent(write_agent)

__all__ = ["WriteAgent", "write_agent"]
