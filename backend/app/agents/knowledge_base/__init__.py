from app.runtime.agent_registry import register_agent
from .agent import KnowledgeBaseAgent

knowledge_base_agent = KnowledgeBaseAgent()
register_agent(knowledge_base_agent)

