import re
from .base import PlatformParser

class BilibiliParser(PlatformParser):

    async def parse(self, html: str, url: str) -> dict:
        info = {
            "source_url": url,
            "source_platform": "Bilibili",
            "author_name": "",
            "words": "",
            "images": [],
            "videos": [url],        # B站直接把原 url 交给 VideoDownloader 去解析下载
        }

        # 标题
        title_match = re.search(r'data-title="([^"]+)"', html)
        title = title_match.group(1) if title_match else ""

        # 作者
        author_match = re.search(r'<meta[^>]*itemprop="author"[^>]*content="([^"]+)"', html)
        info["author_name"] = author_match.group(1) if author_match else "未知作者"

        # 发布时间
        time_match = re.search(r'<div[^>]*class="[^"]*pubdate-ip-text[^"]*"[^>]*>([^<]+)</div>', html)
        time = time_match.group(1) if time_match else ""

        # 描述 & 统计数据
        desc_match = re.search(r'<meta[^>]*itemprop="description"[^>]*content="([^"]+)"', html)
        desc_content = desc_match.group(1) if desc_match else ""

        stats_matches = re.findall(r'(视频播放量|弹幕量|点赞数|投硬币枚数|收藏人数|转发人数)\s*([\d,]+)', desc_content)
        stats_text = ""
        if stats_matches:
            short = {"视频播放量":"播放","弹幕量":"弹幕","点赞数":"点赞","投硬币枚数":"硬币","收藏人数":"收藏","转发人数":"转发"}
            stats = [f"{short.get(k,k)}:{v.replace(',','')}" for k, v in stats_matches]
            stats_text = " ".join(stats)

        info["words"] = f"{title} {time} {stats_text}".strip()

        # 封面图
        cover_match = re.search(r'meta property="og:image" content="([^"]+)"', html)
        if cover_match:
            info["images"] = [cover_match.group(1)]

        return info