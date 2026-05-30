import random
import base64
import httpx
from typing import Optional, List
from dataclasses import dataclass, field
from urllib.parse import urljoin


DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com"
CHANNEL_VERSION = "cc-connect-weixin/1.0"


def _random_wechat_uin() -> str:
    u = random.randint(0, 2**32 - 1)
    return base64.b64encode(str(u).encode()).decode()


# ── 响应类型 ──

@dataclass
class TextItem:
    text: str = ""


@dataclass
class MessageItem:
    type: int = 0
    text_item: Optional[TextItem] = None


@dataclass
class WeixinMessage:
    seq: int = 0
    message_id: int = 0
    from_user_id: str = ""
    to_user_id: str = ""
    client_id: str = ""
    create_time_ms: int = 0
    session_id: str = ""
    message_type: int = 0
    message_state: int = 0
    item_list: List[MessageItem] = field(default_factory=list)
    context_token: str = ""


@dataclass
class GetUpdatesResp:
    ret: int = 0
    errcode: int = 0
    errmsg: str = ""
    msgs: List[WeixinMessage] = field(default_factory=list)
    get_updates_buf: str = ""
    longpolling_timeout_ms: int = 0


@dataclass
class SendMessageResp:
    ret: int = 0
    errcode: int = 0
    errmsg: str = ""


@dataclass
class QRCodeResp:
    qrcode: str = ""
    qrcode_img_content: str = ""


@dataclass
class QRStatusResp:
    status: str = ""
    bot_token: str = ""
    ilink_bot_id: str = ""
    base_url: str = ""


class IlinkClient:
    """微信 iLink Bot HTTP API 客户端。"""

    def __init__(self, base_url: str, token: str, route_tag: str = ""):
        self.base_url = base_url.rstrip("/") + "/"
        self.token = token.strip()
        self.route_tag = route_tag.strip()
        self._client = httpx.Client(timeout=15)
        self._lp_client = httpx.Client(timeout=40)

    def _headers(self) -> dict:
        h = {
            "Content-Type": "application/json",
            "AuthorizationType": "ilink_bot_token",
            "Authorization": f"Bearer {self.token}",
            "X-WECHAT-UIN": _random_wechat_uin(),
        }
        if self.route_tag:
            h["SKRouteTag"] = self.route_tag
        return h

    def get_updates(self, buf: str, timeout_ms: int = 35000) -> GetUpdatesResp:
        url = urljoin(self.base_url, "ilink/bot/getupdates")
        body = {
            "get_updates_buf": buf,
            "base_info": {"channel_version": CHANNEL_VERSION},
        }
        try:
            resp = self._lp_client.post(url, json=body, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            msgs = [_parse_message(m) for m in data.get("msgs", [])]
            return GetUpdatesResp(
                ret=data.get("ret", 0),
                errcode=data.get("errcode", 0),
                errmsg=data.get("errmsg", ""),
                msgs=msgs,
                get_updates_buf=data.get("get_updates_buf", ""),
                longpolling_timeout_ms=data.get("longpolling_timeout_ms", 0),
            )
        except httpx.TimeoutException:
            return GetUpdatesResp(msgs=[], get_updates_buf=buf)

    def send_text(self, to_user_id: str, text: str, context_token: str, client_id: str = "") -> SendMessageResp:
        if not context_token.strip():
            raise ValueError("context_token is required")
        if not client_id:
            client_id = "cc-" + hex(random.randint(0, 2**48))[2:]
        url = urljoin(self.base_url, "ilink/bot/sendmessage")
        body = {
            "msg": {
                "from_user_id": "",
                "to_user_id": to_user_id,
                "client_id": client_id,
                "message_type": 2,
                "message_state": 2,
                "item_list": [{"type": 1, "text_item": {"text": text}}],
                "context_token": context_token,
            },
            "base_info": {"channel_version": CHANNEL_VERSION},
        }
        resp = self._client.post(url, json=body, headers=self._headers())
        resp.raise_for_status()
        data = resp.json()
        return SendMessageResp(
            ret=data.get("ret", 0),
            errcode=data.get("errcode", 0),
            errmsg=data.get("errmsg", ""),
        )

    def get_config(self, user_id: str, context_token: str) -> dict:
        url = urljoin(self.base_url, "ilink/bot/getconfig")
        body = {
            "user_id": user_id,
            "context_token": context_token,
            "base_info": {"channel_version": CHANNEL_VERSION},
        }
        resp = self._client.post(url, json=body, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def verify_token(self) -> bool:
        try:
            self.get_updates("")
            return True
        except Exception:
            return False

    # ── 静态方法：扫码（无需 token）──

    @staticmethod
    def get_bot_qrcode(base_url: str = DEFAULT_BASE_URL, bot_type: int = 3) -> QRCodeResp:
        url = urljoin(base_url.rstrip("/") + "/", "ilink/bot/get_bot_qrcode")
        with httpx.Client(timeout=30) as c:
            resp = c.get(url, params={"bot_type": bot_type})
            resp.raise_for_status()
            data = resp.json()
            return QRCodeResp(
                qrcode=data.get("qrcode", ""),
                qrcode_img_content=data.get("qrcode_img_content", ""),
            )

    @staticmethod
    def poll_qr_status(qrcode: str, base_url: str = DEFAULT_BASE_URL) -> QRStatusResp:
        url = urljoin(base_url.rstrip("/") + "/", "ilink/bot/get_qrcode_status")
        headers = {"iLink-App-ClientVersion": "1"}
        with httpx.Client(timeout=40) as c:
            resp = c.get(url, params={"qrcode": qrcode}, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return QRStatusResp(
                status=data.get("status", ""),
                bot_token=data.get("bot_token", ""),
                ilink_bot_id=data.get("ilink_bot_id", ""),
                base_url=data.get("baseurl", ""),
            )


def _parse_message(raw: dict) -> WeixinMessage:
    items = []
    for it in raw.get("item_list", []):
        ti = None
        if it.get("text_item"):
            ti = TextItem(text=it["text_item"].get("text", ""))
        items.append(MessageItem(type=it.get("type", 0), text_item=ti))
    return WeixinMessage(
        seq=raw.get("seq", 0),
        message_id=raw.get("message_id", 0),
        from_user_id=raw.get("from_user_id", ""),
        to_user_id=raw.get("to_user_id", ""),
        client_id=raw.get("client_id", ""),
        create_time_ms=raw.get("create_time_ms", 0),
        session_id=raw.get("session_id", ""),
        message_type=raw.get("message_type", 0),
        message_state=raw.get("message_state", 0),
        item_list=items,
        context_token=raw.get("context_token", ""),
    )


def extract_text(msg: WeixinMessage) -> str:
    texts = []
    for it in msg.item_list:
        if it.type == 1 and it.text_item:
            texts.append(it.text_item.text)
    return "\n".join(texts)
