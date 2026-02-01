import re
from datetime import datetime
from typing import List
from .base import PlatformParser

class XiaohongshuParser(PlatformParser):
    
    def _extract_images(self, html: str) -> List[str]:
        pattern = r'http://sns-webpic-qc\.xhscdn\.com/[^"\s]+!nd_(?:prv|dft)_wlteh_webp_\d+'
        urls = re.findall(pattern, html)
        seen = {}
        for url in urls:
            key_match = re.search(r'(1040g[^!]+)', url)
            if key_match:
                key = key_match.group(1)
                if key not in seen or ('!nd_prv_' in url and '!nd_prv_' not in seen[key]):
                    seen[key] = url
        return list(seen.values())

    def _has_video_content(self, html: str) -> bool:
        video_patterns = [
            r'"video"[^}]*"stream"[^}]*"h264"',
            r'"media"[^}]*"video"[^}]*"stream"',
            r'"masterUrl"[^}]*http[^"]+\.mp4',
            r'"streamType"[^}]*"h264"',
        ]
        return any(re.search(p, html, re.IGNORECASE) for p in video_patterns)

    async def parse(self, html: str, url: str) -> dict:
        info = {
            "source_url": url,
            "source_platform": "小红书",
            "author_name": "",
            "words": "",
            "images": [],
            "videos": [],     
        }

        # 作者名
        for pat in [
            r'class="username"[^>]*>([^<]+)</span>',
            r'"nickname":"([^"]+)"',
            r'"user"[^{]*"nickname":"([^"]+)"',
            r'class="name"[^>]*>([^<]+)</a>'
        ]:
            m = re.search(pat, html)
            if m and m.group(1).strip() not in ["", "小红书"]:
                info["author_name"] = m.group(1).strip()
                break

        # 标题 + 正文 + 时间地点 + 标签
        title = re.search(r'<div[^>]*id="detail-title"[^>]*>(.*?)</div>', html)
        title = title.group(1) if title else ""

        desc = re.search(r'"desc":"([^"]+)"', html)
        desc_text = desc.group(1).replace('\\n', '\n').replace('\\t', ' ') if desc else ""
        desc_text = re.sub(r'#[^[]+\[话题\]\s*', '', desc_text).strip()

        location = re.search(r'"ipLocation":"([^"]+)"', html)
        location = location.group(1) if location else ""

        time_match = re.search(r'"time":(\d+)', html)
        date_str = ""
        if time_match:
            try:
                ts = int(time_match.group(1)) // 1000
                date_str = datetime.fromtimestamp(ts).strftime("%m-%d")
            except:
                pass

        date_location = f"{date_str} {location}".strip() if date_str or location else ""

        tags = " ".join(f"#{t}" for t in re.findall(r'#([\w\u4e00-\u9fa5]+)\[话题\]', html))

        parts = [p for p in [title, desc_text, date_location, tags] if p]
        info["words"] = re.sub(r'\s+', ' ', " ".join(parts)).strip()

        # 图片
        info["images"] = self._extract_images(html)

        if self._has_video_content(html):
                    info["videos"] = [url]


        return info