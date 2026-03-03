from typing import Dict, Any


def build_chat_response(reply: str, **extra_info) -> Dict[str, Any]:
    return {
        "reply": reply,
        **extra_info
    }