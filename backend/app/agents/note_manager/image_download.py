from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from pathlib import Path
import os
import time


class ImageDownloader:
    def __init__(self, download_path):
        self.download_path = Path(download_path)
        os.makedirs(self.download_path, exist_ok=True)

    def _normalize_url(self, url: str) -> str:
        # xhscdn 经常拒绝 http，强制升级到 https
        if url.startswith("http://sns-webpic") or url.startswith("http://sns-img"):
            return "https://" + url[len("http://") :]
        return url

    def download_image(self, url: str, filename: str = None) -> str:
        try:
            url = self._normalize_url(url)
            req = Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://www.xiaohongshu.com/",
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                },
            )

            # 最小重试：应对 502/503/504 这类临时 CDN 问题
            last_err: Exception | None = None
            for attempt in range(3):
                try:
                    with urlopen(req, timeout=30) as resp:
                        content_type = (resp.headers.get("Content-Type") or "").lower()
                        data = resp.read()
                    last_err = None
                    break
                except HTTPError as e:
                    last_err = e
                    if e.code in (502, 503, 504) and attempt < 2:
                        time.sleep(0.6 * (attempt + 1))
                        continue
                    raise
                except URLError as e:
                    last_err = e
                    if attempt < 2:
                        time.sleep(0.6 * (attempt + 1))
                        continue
                    raise

            if last_err is not None:
                raise last_err

            # 推断后缀
            if filename is None:
                suffix = Path(urlparse(url).path).suffix.lower()
                if not suffix or len(suffix) > 5:
                    if "image/png" in content_type:
                        suffix = ".png"
                    elif "image/webp" in content_type:
                        suffix = ".webp"
                    elif "image/gif" in content_type:
                        suffix = ".gif"
                    else:
                        suffix = ".jpg"
                
                # 从 URL 里取文件名主体（可选）或用随机名
                url_path = Path(urlparse(url).path)
                basename = url_path.stem if url_path.stem else "image"
                filename = f"{basename}{suffix}"

            # 保存文件
            out_path = self.download_path / filename
            with open(out_path, "wb") as f:
                f.write(data)

            return filename

        except Exception as e:
            raise Exception(f"图片下载失败: {str(e)}")


def main():
    """简单测试"""
    downloader = ImageDownloader(download_path="./downloads")
    test_url = [
        "http://sns-webpic-qc.xhscdn.com/202601112000/7286697a8a0193b40b70877c414c2f34/spectrum/1040g34o31r5d7acf70105plpv6t7c36lqds1cvg!nd_prv_wlteh_webp_3",
        "http://sns-webpic-qc.xhscdn.com/202601112000/1a7b28d3976534c07051a75c081ccef4/1040g00831qlra9en0a6g5pq6r1l08f71k6dvce8!nd_prv_wlteh_webp_3"
        ]
    
    try:
        for url in test_url:
            filename = downloader.download_image(url)
            print(f"下载成功: {filename}")
    except Exception as e:
        print(f"下载失败: {e}")

if __name__ == "__main__":
    main()

