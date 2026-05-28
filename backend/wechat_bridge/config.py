import yaml
from dataclasses import dataclass, field


@dataclass
class BridgeConfig:
    host: str = "127.0.0.1"
    port: int = 8001
    backend_url: str = "http://127.0.0.1:8000"
    agent_id: str = "std"
    user_id: str = "wechat-bridge"


@dataclass
class WeixinConfig:
    token: str = ""
    base_url: str = "https://ilinkai.weixin.qq.com"
    account_id: str = "default"
    long_poll_timeout_ms: int = 35000
    state_dir: str = "./data/weixin"


@dataclass
class AppConfig:
    bridge: BridgeConfig = field(default_factory=BridgeConfig)
    weixin: WeixinConfig = field(default_factory=WeixinConfig)


def load_config(path: str) -> AppConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    cfg = AppConfig()
    if "bridge" in raw:
        b = raw["bridge"]
        cfg.bridge = BridgeConfig(
            host=b.get("host", cfg.bridge.host),
            port=b.get("port", cfg.bridge.port),
            backend_url=b.get("backend_url", cfg.bridge.backend_url),
            agent_id=b.get("agent_id", cfg.bridge.agent_id),
            user_id=b.get("user_id", cfg.bridge.user_id),
        )
    if "weixin" in raw:
        w = raw["weixin"]
        cfg.weixin = WeixinConfig(
            token=w.get("token", cfg.weixin.token),
            base_url=w.get("base_url", cfg.weixin.base_url),
            account_id=w.get("account_id", cfg.weixin.account_id),
            long_poll_timeout_ms=w.get("long_poll_timeout_ms", cfg.weixin.long_poll_timeout_ms),
            state_dir=w.get("state_dir", cfg.weixin.state_dir),
        )
    return cfg
