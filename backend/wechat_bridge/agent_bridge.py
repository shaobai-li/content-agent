import json
import httpx
from loguru import logger

from .platform import WeixinPlatform, Message


class AgentBridge:
    """MessageHandler 回调：收消息 → 调 content-agent SSE API → platform.reply()。"""

    def __init__(self, backend_url: str, agent_id: str, user_id: str = "wechat-bridge"):
        self.backend_url = backend_url.rstrip("/")
        self.agent_id = agent_id
        self.user_id = user_id

    def __call__(self, platform: WeixinPlatform, msg: Message):
        try:
            reply_text = self._chat_stream(msg.content, msg.session_id)
            if reply_text:
                platform.reply(msg.reply_ctx, reply_text)
        except Exception as e:
            logger.error("agent_bridge: chat error: {}", e)
            platform.reply(msg.reply_ctx, "抱歉，处理消息时出现错误，请稍后再试。")

    def _chat_stream(self, text: str, session_id: str) -> str:
        url = f"{self.backend_url}/api/agents/{self.agent_id}/chat/stream"
        parts = []
        with httpx.stream(
            "POST", url,
            data={"text": text, "session_id": session_id},
            headers={"X-User-Id": self.user_id},
            timeout=120,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if "content" in data:
                            parts.append(data["content"])
                    except json.JSONDecodeError:
                        pass
        return "".join(parts)
