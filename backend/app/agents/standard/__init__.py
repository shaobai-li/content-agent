from app.runtime.agent_registry import register_agent

from .agent import StandardAgent

# 默认注册的标准 Agent（可在此或别处继续 register 更多仅配置不同的实例）
STD_AGENT_ID = "std"

standard_agent = StandardAgent(agent_id=STD_AGENT_ID)
register_agent(standard_agent)
