from app.runtime.agent_registry import register_agent
from .agent import ContentDetectionAgent

content_detection_agent = ContentDetectionAgent()
register_agent(content_detection_agent)
