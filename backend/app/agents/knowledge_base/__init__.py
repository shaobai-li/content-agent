"""
知识库 Agent
用于管理和处理文档、文件等知识库内容
"""
from app.runtime.agent_registry import register_agent
from .agent import KnowledgeBaseAgent

# 创建并注册 agent 实例
knowledge_base_agent = KnowledgeBaseAgent()
register_agent(knowledge_base_agent)

# 导出路由供主应用使用
__all__ = ["knowledge_base_agent"]
