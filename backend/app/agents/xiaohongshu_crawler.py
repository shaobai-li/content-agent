import re
import asyncio
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy
from datetime import datetime
from .video_download import VideoDownloader
import json
import os
from pathlib import Path
from app.core.config import DATA_DIR
from app.core.ids import new_uuid

class XiaohongshuCrawler:

    def __init__(self, data_dir=DATA_DIR):
        self.data_dir = data_dir
        self.records_path = self.data_dir / "records.jsonl"

        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.records_path):
            with open(self.records_path, "w", encoding="utf-8") as f:
                pass
    def _persist_result(self, data: dict):
        with open(self.records_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

    def _has_video_content(self, html: str) -> bool:
        """
        判断HTML中是否包含视频内容
        :param html: 网页HTML
        :return: True/False
        """
        # 检查视频关键词
        video_patterns = [
            r'"video"[^}]*"stream"[^}]*"h264"',
            r'"media"[^}]*"video"[^}]*"stream"',
            r'"masterUrl"[^}]*http[^"]+\.mp4',
            r'"streamType"[^}]*"h264"',
        ]
        
        for pattern in video_patterns:
            if re.search(pattern, html, re.IGNORECASE):
                return True
        return False
    

    
    def _extract_images(self, html: str):
        """提取高清原图链接（去重，优先 prv）"""
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

    def _parse_content(self, html: str, source_url: str):
        """解析页面内容，返回标准格式"""
        info = {
            "source_url": source_url,
            "source_platform": "小红书",
            "author_name": "",
            "words": "",
            "videos": [],
            "images": []
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

        # 标题
        title = re.search(r'<div[^>]*id="detail-title"[^>]*>(.*?)</div>',  html)
        title = title.group(1) if title else ""

        # 正文
        desc = re.search(r'"desc":"([^"]+)"', html)
        desc_text = ""
        if desc:
            desc_text = desc.group(1).replace('\\n', '\n').replace('\\t', ' ')
            desc_text = re.sub(r'#[^[]+\[话题\]\s*', '', desc_text).strip()

        # 时间地点
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

        # 标签
        tags = " ".join(f"#{t}" for t in re.findall(r'#([\w\u4e00-\u9fa5]+)\[话题\]', html))

        # 组合文字
        parts = [p for p in [title, desc_text, date_location, tags] if p]
        info["words"] = re.sub(r'\s+', ' ', " ".join(parts)).strip()

        # 图片原始链接
        info["images"] = self._extract_images(html)

        return info

    async def _fetch_html(self, url: str) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                           "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 XiaoHongShu/8.25.0"
        }
        config = CrawlerRunConfig(
            scraping_strategy=LXMLWebScrapingStrategy(),
            verbose=False
        )
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url, config=config, magic=True, headers=headers)
            if not result.success or not result.html:
                raise Exception("页面爬取失败或内容为空")
            return result.html

    async def crawl_note(self, clean_url: str) -> dict:
        """
        主方法：接收一个纯净的笔记 URL，返回解析结果
        """

        try:
            html = await self._fetch_html(clean_url)
            data = self._parse_content(html, clean_url)
            print(html)

            # 先生成 record_id，后续下载/落盘都按该目录组织
            data["record_id"] = data.get("record_id") or new_uuid()
            record_dir = self.data_dir / data["record_id"]
            os.makedirs(record_dir, exist_ok=True)

            # 检测是否有视频内容
            if self._has_video_content(html):
                print(f"[XiaohongshuCrawler] 检测到视频内容，开始下载...")
                
                # 直接下载原始URL
                try:
                    downloader = VideoDownloader(record_dir)
                    filename = downloader.download_video(clean_url)
                    if filename:
                        # 存相对路径，便于从 DATA_DIR 定位文件
                        data["videos"].append((Path(data["record_id"]) / filename).as_posix())
                        print(f"[XiaohongshuCrawler] 视频下载成功: {filename}")
                    else:
                        print(f"[XiaohongshuCrawler] 视频下载失败")
                except Exception as e:
                    print(f"[XiaohongshuCrawler] 视频下载异常: {str(e)}")
            else:
                print(f"[XiaohongshuCrawler] 未检测到视频内容")
                data["videos"] = []
            
            self._persist_result(data)
            return {
                "message":  f"{data}",
                "type": "xiaohongshu",
                "data": data
            }

        except Exception as e:
            print(f"[XiaohongshuCrawler] 爬取失败: {str(e)}")
            return {
                "message": f"爬取失败：{str(e)}",
                "type": "error",
                "data": None
            }

def main():
    # 从 backend/test/urls.txt 挑的样例（可自行增删）
    test_urls = [
        "https://www.xiaohongshu.com/explore/69521554000000001e035658?xsec_token=ABkzg2CYlgCu419P_iDdwgK5O-MlNln5-UiXUxZHfUzEw=&xsec_source=pc_feed",
        "https://www.xiaohongshu.com/explore/696204f1000000002200bfd6?xsec_token=ABCvIn39KwblGPS9HmxFV8On6azZyjm_DIB-_kwGRvjPE=&xsec_source=pc_feed",
    ]

    crawler = XiaohongshuCrawler(data_dir=DATA_DIR)

    async def _run():
        for url in test_urls:
            print("\n" + "=" * 80)
            print(f"[TEST] {url}")

            # 小红书：解析图文；如检测到视频会触发下载并写入 data["videos"]
            result = await crawler.crawl_note(url)
            print(result)

    asyncio.run(_run())


if __name__ == "__main__":
    main()