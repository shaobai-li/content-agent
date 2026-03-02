from typing import List, Dict
import os
from openai import OpenAI


_client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)


def chat(messages: List[Dict[str, str]], model: str = "deepseek-chat") -> str:
    response = _client.chat.completions.create(
        model=model,
        messages=messages,
    )
    return response.choices[0].message.content or ""
