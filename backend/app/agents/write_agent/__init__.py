from app.runtime.agent_registry import register_agent
from .agent import WriteAgent

write_agent = WriteAgent()
register_agent(write_agent)
