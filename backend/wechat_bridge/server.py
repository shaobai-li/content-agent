import base64
import io
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from loguru import logger
import qrcode

from .config import AppConfig
from .client import IlinkClient
from .storage import Storage
from .platform import WeixinPlatform
from .agent_bridge import AgentBridge


def _make_qrcode_data_uri(data: str) -> str:
    """用 qrcode 库本地生成二维码 PNG，返回 data URI。"""
    img = qrcode.make(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


class BridgeStartReq(BaseModel):
    token: str
    base_url: str = "https://ilinkai.weixin.qq.com"
    account_id: str = "default"


class BridgeStatusResp(BaseModel):
    running: bool
    account_id: str = ""
    connected_since: str = ""


def create_app(config: AppConfig) -> FastAPI:
    platform: WeixinPlatform | None = None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("wechat-bridge: server starting on {}:{}", config.bridge.host, config.bridge.port)
        yield
        if platform:
            platform.stop()
        logger.info("wechat-bridge: server stopped")

    app = FastAPI(title="WeChat iLink Bridge", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/wechat/qrcode")
    async def get_qrcode():
        resp = IlinkClient.get_bot_qrcode()
        # iLink 返回的 qrcode_img_content 是 LiteApp 网页地址，不是图片。
        # 后端本地生成二维码：将网页 URL 编码为 PNG data URI。
        img_src = _make_qrcode_data_uri(resp.qrcode_img_content)
        logger.info("qrcode len={} qrcode_img_url={}...", len(resp.qrcode), resp.qrcode_img_content[:80])
        return {
            "qrcode_key": resp.qrcode,
            "qrcode_img_url": img_src,
        }

    @app.get("/api/wechat/qrcode/status")
    async def qrcode_status(qrcode: str = Query(...)):
        resp = IlinkClient.poll_qr_status(qrcode)
        return {
            "status": resp.status,
            "bot_token": resp.bot_token,
            "ilink_bot_id": resp.ilink_bot_id,
            "base_url": resp.base_url,
        }

    @app.post("/api/wechat/bridge/start")
    async def bridge_start(body: BridgeStartReq):
        nonlocal platform
        if platform is not None:
            return {"ok": True, "already_running": True}
        client = IlinkClient(
            base_url=body.base_url,
            token=body.token,
        )
        storage = Storage(
            state_dir=config.weixin.state_dir,
            account_id=body.account_id,
        )
        platform = WeixinPlatform(client=client, storage=storage)
        handler = AgentBridge(
            backend_url=config.bridge.backend_url,
            agent_id=config.bridge.agent_id,
            user_id=config.bridge.user_id,
        )
        platform.start(handler)
        return {"ok": True}

    @app.post("/api/wechat/bridge/stop")
    async def bridge_stop():
        nonlocal platform
        if platform:
            platform.stop()
            platform = None
        return {"ok": True}

    @app.get("/api/wechat/bridge/status")
    async def bridge_status():
        return BridgeStatusResp(
            running=platform is not None,
        )

    return app
