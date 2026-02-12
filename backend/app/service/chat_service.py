from typing import Optional, Dict, Any


def build_chat_response(reply: str, **extra_info) -> Dict[str, Any]:
    return {
        "reply": reply,
        **extra_info
    }

def process_text_message(text: str, agent_name: str) -> str:
    return f"{agent_name}收到消息: {text}"