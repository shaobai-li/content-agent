import os
import asyncio
from pathlib import Path
from app.core.config import DATA_DIR
from app.core.ids import new_uuid
from .factory import get_parser
from .video_download import VideoDownloader
from .image_download import ImageDownloader
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy
import json

class Crawler:
    def __init__(self, data_dir=DATA_DIR):
        self.data_dir = Path(data_dir)
        self.records_path = self.data_dir / "records.jsonl"
        os.makedirs(self.data_dir, exist_ok=True)
        if not self.records_path.exists():
            self.records_path.touch()

    def _persist_result(self, data: dict):
        with open(self.records_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

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
        try:
            parser = get_parser(clean_url)
            if not parser:
                return {"reply": "暂不支持该平台地址"}

            html = await self._fetch_html(clean_url)
            data = await parser.parse(html, clean_url)   # ← 现在只干这一件事！

            # 下面全是“下载 + 存储”逻辑，和平台解析完全解耦
            data["record_id"] = new_uuid()
            record_dir = self.data_dir / data["record_id"]
            record_dir.mkdir(exist_ok=True)

            # 下载图片
            saved_images = []
            if data["images"]:
                img_downloader = ImageDownloader(record_dir)
                for url in data["images"]:
                    try:
                        filename = img_downloader.download_image(url)
                        saved_images.append((Path(data["record_id"]) / filename).as_posix())
                    except Exception as e:
                        print(f"图片下载失败: {url} | {e}")
                data["images"] = saved_images


            if data.get("videos"):
                video_downloader = VideoDownloader(record_dir)
                video_url = data["videos"][0] 
                try:
                    filename = video_downloader.download_video(video_url)
                    if filename:
                        data["videos"] = [(Path(data["record_id"]) / filename).as_posix()]
                except Exception as e:
                    print(f"视频下载失败: {e}")
                    data["videos"] = []

            self._persist_result(data)
            return {
                "reply": f"下载完成，作者：{data['author_name']}\n{data['words']}"
            }

        except Exception as e:
            error_msg = f"爬取失败: {str(e)}"
            print(error_msg)
            return {"reply": error_msg}

def main():
    # 从 backend/test/urls.txt 挑的样例（可自行增删）
    test_urls = [
        "https://www.xiaohongshu.com/explore/697a79d3000000000b0090d6?xsec_token=ABMLin12MZkXVy7oF6cn1O1OXJek7hvK3AaCMorzzLiwY=&xsec_source=pc_feed",
    ]

    crawler = Crawler(data_dir=".data")

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