from pathlib import Path
from app.utils import llm_client

_PROMPT_PATH = Path(__file__).parent / "prompts" / "system.md"


class WriteAgent:
    def __init__(self):
        self.system_prompt = _PROMPT_PATH.read_text(encoding="utf-8").strip()

    def chat(self, text: str) -> str:
        return llm_client.chat([
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": text},
        ])


agent = WriteAgent()
