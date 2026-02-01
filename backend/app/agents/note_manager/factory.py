from typing import Optional
from .xiaohongshu import XiaohongshuParser
from .bilibili import BilibiliParser
from .base import PlatformParser

def get_parser(url: str) -> Optional[PlatformParser]:
    if "xiaohongshu.com" in url or "xhslink.com" in url:
        return XiaohongshuParser()
    if "bilibili.com" in url or "b23.tv" in url:
        return BilibiliParser()
    return None