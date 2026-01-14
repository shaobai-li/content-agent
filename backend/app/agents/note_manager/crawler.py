import re
import asyncio
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy
from datetime import datetime
from .video_download import VideoDownloader
from .image_download import ImageDownloader
import json
import os
from pathlib import Path
from app.core.config import DATA_DIR
from app.core.ids import new_uuid

class Crawler:

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

    def _identify_platform(self, url: str) -> str:
        """识别 URL 所属平台"""
        if "xiaohongshu.com" in url or "xhslink.com" in url:
            return "xhs"
        elif "bilibili.com" in url or "b23.tv" in url:
            return "bilibili"
        return "unknown"

    def _parse_bilibili_content(self, html: str, source_url: str):
        """解析B站视频页面内容"""
        info = {
            "source_url": source_url,
            "source_platform": "Bilibili",
            "author_name": "",
            "words": "",
            "videos": [],
            "images": []
        }
        
        # 提取标题 
        title_match = re.search(r'data-title="([^"]+)"', html)   
        title = title_match.group(1) if title_match else ""

        # 提取作者
        author_match = re.search(r'<meta[^>]*itemprop="author"[^>]*content="([^"]+)"', html)
        info["author_name"] = author_match.group(1) if author_match else "未知作者"

        # 提取发布时间
        time_match = re.search(r'<div[^>]*class="[^"]*pubdate-ip-text[^"]*"[^>]*>([^<]+)</div>', html)
        time = time_match.group(1) if time_match else ""

        desc_match = re.search(r'<meta[^>]*itemprop="description"[^>]*content="([^"]+)"', html)
        desc_content = desc_match.group(1) if desc_match else ""
        
        # 提取所有统计数据
        stats_matches = re.findall(r'(视频播放量|弹幕量|点赞数|投硬币枚数|收藏人数|转发人数)\s*([\d,]+)', desc_content)
        
        # 统计信息格式
        stats_text = ""
        if stats_matches:
            stats_dict = {}
            for stat_name, stat_value in stats_matches:
                short_name = {
                    "视频播放量": "播放",
                    "弹幕量": "弹幕",
                    "点赞数": "点赞",
                    "投硬币枚数": "硬币",
                    "收藏人数": "收藏",
                    "转发人数": "转发"
                }.get(stat_name, stat_name)
                stats_dict[short_name] = stat_value.replace(",", "")
            
            # 将统计信息拼接成字符串
            stats_list = [f"{k}:{v}" for k, v in stats_dict.items()]
            stats_text = " ".join(stats_list)
        # 组合文字信息
        info["words"] = f"{title} {time} {stats_text}".strip()
        
        # 提取封面图 (Open Graph 协议)
        cover_match = re.search(r'meta property="og:image" content="([^"]+)"', html)
        if cover_match:
            info["images"] = [cover_match.group(1)]

        return info
    
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
            platform = self._identify_platform(clean_url)
            if platform == "unknown":
                return {"reply": "暂不支持该平台地址"}

            # 1. 抓取 HTML
            html = await self._fetch_html(clean_url)
            print(html)
            
            # 2. 根据平台分发解析逻辑
            if platform == "xhs":
                data = self._parse_content(html, clean_url)
                is_video = self._has_video_content(html)
            else:
                data = self._parse_bilibili_content(html, clean_url)
                is_video = True # B站链接默认为视频

            # 先生成 record_id，后续下载/落盘都按该目录组织
            data["record_id"] = data.get("record_id") or new_uuid()
            record_dir = self.data_dir / data["record_id"]
            os.makedirs(record_dir, exist_ok=True)

            # 下载图片，并把相对路径写回 images 字段
            image_urls = data.get("images") or []
            if image_urls:
                saved_images = []
                img_downloader = ImageDownloader(record_dir)
                for url in image_urls:
                    try:
                        filename = img_downloader.download_image(url)
                        saved_images.append((Path(data["record_id"]) / filename).as_posix())
                    except Exception as e:
                        print(f"[XiaohongshuCrawler] 图片下载失败: {url} | {str(e)}")
                data["images"] = saved_images

            # 检测是否有视频内容
            if is_video:
                print(f"[{platform}] 识别为视频内容，开始下载...")
                try:
                    downloader = VideoDownloader(record_dir)
                    filename = downloader.download_video(clean_url)
                    if filename:
                        # 确保 data["videos"] 是列表并存入路径
                        if "videos" not in data: data["videos"] = []
                        data["videos"].append((Path(data["record_id"]) / filename).as_posix())
                        print(f"[{platform}] 视频下载成功")
                except Exception as e:
                    print(f"[{platform}] 视频下载异常: {e}")
            else:
                print(f"[{platform}] 识别为纯图文，跳过视频下载")
                data["videos"] = []

            # 6. 保存并返回
            self._persist_result(data)
            reply_message = f"下载完成，作者：{data['author_name']}\n{data['words']}"
            return {
                "reply": reply_message
            }
        except Exception as e:
            error_message = f"爬取失败: {str(e)}"
            print(error_message)
            return {
                "reply": error_message
            }

def main():
    # 从 backend/test/urls.txt 挑的样例（可自行增删）
    test_urls = [
        "https://www.bilibili.com/video/BV1ysqBBgEoW/?spm_id_from=333.1007.tianma.12-2-36.click",
    ]

    crawler = Crawler(data_dir=DATA_DIR)

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