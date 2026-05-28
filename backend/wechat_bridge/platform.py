import time
import uuid
import threading
from typing import Callable, Optional, Dict
from loguru import logger

from .client import IlinkClient, extract_text, WeixinMessage
from .storage import Storage


MAX_CHUNK_CHARS = 3800
CHUNK_DELAY = 0.1
SEND_MAX_RETRIES = 3
DEDUP_WINDOW = 300


MessageHandler = Callable[["WeixinPlatform", "Message"], None]


class Message:
    """平台无关的消息结构。"""

    def __init__(self, user_id: str, content: str, session_id: str, reply_ctx: "ReplyContext"):
        self.user_id = user_id
        self.content = content
        self.session_id = session_id
        self.reply_ctx = reply_ctx


class ReplyContext:
    """回复上下文，包含回复所需的所有信息。"""

    def __init__(self, to_user_id: str):
        self.to_user_id = to_user_id


class WeixinPlatform:
    """微信 iLink Bot 平台适配器。

    Platform 不感知 Agent。只调 handler(platform, msg)，由 handler 决定怎么处理。
    """

    def __init__(self, client: IlinkClient, storage: Storage):
        self.client = client
        self.storage = storage
        self._handler: Optional[MessageHandler] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._dedup: Dict[str, float] = {}
        self._pause_until: float = 0

    def start(self, handler: MessageHandler):
        self._handler = handler
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("weixin: platform polling started")

    def stop(self):
        self._running = False
        logger.info("weixin: platform stopped")

    def reply(self, reply_ctx: ReplyContext, text: str):
        context_token = self.storage.get_context_token(reply_ctx.to_user_id)
        if not context_token:
            logger.error("weixin: missing context_token for {}, cannot reply", reply_ctx.to_user_id)
            return
        chunks = self._split_chunks(text)
        for i, chunk in enumerate(chunks):
            if i > 0:
                time.sleep(CHUNK_DELAY)
            for attempt in range(SEND_MAX_RETRIES):
                try:
                    resp = self.client.send_text(
                        reply_ctx.to_user_id, chunk, context_token,
                        client_id="cc-" + uuid.uuid4().hex[:12],
                    )
                    if resp.ret == -2:
                        fresh = self.storage.get_context_token(reply_ctx.to_user_id)
                        if fresh and fresh != context_token:
                            context_token = fresh
                        continue
                    break
                except Exception as e:
                    if attempt == SEND_MAX_RETRIES - 1:
                        logger.error("weixin: chunk send failed: {}", e)
                        return

    def _poll_loop(self):
        backoff = 1.0
        while self._running:
            try:
                if time.time() < self._pause_until:
                    time.sleep(5)
                    continue

                buf = self.storage.get_buf()
                resp = self.client.get_updates(buf)

                if resp.errcode == -14:
                    self._pause_until = time.time() + 3600
                    logger.warning("weixin: session expired, pausing 1h")
                    continue

                backoff = 1.0

                if self._handler:
                    for msg in resp.msgs:
                        self._dispatch(msg)

                if resp.get_updates_buf and resp.get_updates_buf != buf:
                    self.storage.set_buf(resp.get_updates_buf)

            except Exception as e:
                logger.warning("weixin: poll error: {} (backoff={}s)", e, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def _dispatch(self, msg: WeixinMessage):
        if msg.message_type == 2:
            return
        from_id = msg.from_user_id.strip()
        if not from_id:
            return
        dedup_key = f"{from_id}|{msg.message_id}|{msg.seq}|{msg.create_time_ms}"
        now = time.time()
        self._dedup = {k: v for k, v in self._dedup.items() if v > now}
        if dedup_key in self._dedup:
            return
        self._dedup[dedup_key] = now + DEDUP_WINDOW
        if msg.context_token.strip():
            self.storage.set_context_token(from_id, msg.context_token.strip())
        body = extract_text(msg)
        if not body.strip():
            return
        try:
            reply_ctx = ReplyContext(to_user_id=from_id)
            self._handler(self, Message(
                user_id=from_id,
                content=body,
                session_id=f"weixin:{from_id}",
                reply_ctx=reply_ctx,
            ))
        except Exception as e:
            logger.error("weixin: dispatch error: {}", e)

    @staticmethod
    def _split_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list:
        if len(text) <= max_chars:
            return [text]
        return [text[i:i + max_chars] for i in range(0, len(text), max_chars)]
