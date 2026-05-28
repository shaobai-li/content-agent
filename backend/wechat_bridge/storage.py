import json
from pathlib import Path
from threading import Lock
from typing import Dict, Optional


class Storage:
    """文件持久化：buf 游标 + context_token 映射。

    目录结构：
      <state_dir>/<account_id>/
        get_updates.buf
        context_tokens.json
    """

    def __init__(self, state_dir: str, account_id: str = "default"):
        self._dir = Path(state_dir) / account_id
        self._dir.mkdir(parents=True, exist_ok=True)
        self._buf_path = self._dir / "get_updates.buf"
        self._tokens_path = self._dir / "context_tokens.json"
        self._tokens: Dict[str, str] = {}
        self._buf: str = ""
        self._lock = Lock()
        self._load()

    def get_buf(self) -> str:
        with self._lock:
            return self._buf

    def set_buf(self, buf: str):
        with self._lock:
            self._buf = buf
            self._buf_path.write_text(buf, encoding="utf-8")

    def get_context_token(self, from_user_id: str) -> Optional[str]:
        with self._lock:
            return self._tokens.get(from_user_id)

    def set_context_token(self, from_user_id: str, token: str):
        with self._lock:
            self._tokens[from_user_id] = token
            self._tokens_path.write_text(
                json.dumps(self._tokens, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    def _load(self):
        if self._buf_path.exists():
            self._buf = self._buf_path.read_text(encoding="utf-8").strip()
        if self._tokens_path.exists():
            try:
                self._tokens = json.loads(self._tokens_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self._tokens = {}
