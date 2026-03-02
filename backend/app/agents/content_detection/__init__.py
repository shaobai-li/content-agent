"""
内容检测 Agent
用于识别文本中的风险内容、敏感表达和潜在违规点
"""
from app.agents.simple_chat_agent import SimpleChatAgent
from app.runtime.agent_registry import register_agent

AGENT_ID = "c"
SYSTEM_PROMPT = """你是一个专业的内容检测助手。你可以帮助用户识别文本中的风险内容、敏感表达和潜在违规点,并给出清晰可执行的修改建议。请用中文回复,语气专业且客观。"""


# 创建并注册 agent 实例
content_detection_agent = SimpleChatAgent(
    agent_id=AGENT_ID,
    system_prompt=SYSTEM_PROMPT
)

register_agent(content_detection_agent)
