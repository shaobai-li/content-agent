import yt_dlp
from urllib.parse import urlparse
import os

class VideoDownloader:
    def __init__(self, download_path="./downloads"):
        self.download_path = os.path.abspath("./downloads")
        os.makedirs(self.download_path, exist_ok=True)
    
    def get_platform(self, url):
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.lower()
    
        if 'youtube.com' in domain or 'youtu.be' in domain:
            return 'YouTube'
        elif 'bilibili.com' in domain:
            return 'Bilibili'
        elif 'xiaohongshu.com' in domain:
            return 'Xiaohongshu'
        else:
            return 'Unknown'


    def download_video(self, url):
    
        platform = self.get_platform(url)
        print(platform)


        ydl_opts_base = {
            'writeinfojson': False,
            'writesubtitles': True,  # 启用字幕下载（适用于所有模式）
            'writeautomaticsubtitles': True,  # 下载自动生成的字幕（如果可用）
            'subtitlesformat': 'vtt',  # 字幕格式（srt 更常用，也可改为 vtt/ttml 等）
            'subtitleslangs': 'all',  # 下载指定语言字幕，'all' 下载所有可用语言
            'ignoreerrors': False,
            'cookies': None,
            'no_color': True, 
        }

        if platform == 'Xiaohongshu':
            ydl_opts_base['format'] = 'best'
            ydl_opts_base.pop('cookies', None)

        # 用于提取信息（不下载）
        info_opts = ydl_opts_base.copy()
        info_opts.update({
            'skip_download': True,  # 只提取信息
        })

        ydl_opts = ydl_opts_base.copy()
        ydl_opts.update({
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': {'default': os.path.join(self.download_path,'%(title)s.%(ext)s'), 
                        'subtitle': os.path.join(self.download_path,'%(title)s.%(ext)s.%(id)s')
                    },
            'merge_output_format': 'mp4',
        })

        try:
            # 1. 先提取视频信息
            with yt_dlp.YoutubeDL(info_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            # 2. 生成最终文件名（完整路径）
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                full_filename = ydl.prepare_filename(info)

            # 3. 执行下载
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # 4. 只返回纯文件名（不带路径）
            return os.path.basename(full_filename)
        except Exception as e:
                    return f"下载失败\n{str(e)}"
    


def main():
    """简单测试版本"""
    downloader = VideoDownloader()
    
    
    test_url = "https://www.xiaohongshu.com/explore/6943eef7000000001e03513f?xsec_token=ABi_0tYp3s_7EkVdrN3Xx_nrtR_0UiJyXBXswSIEuZioY=&xsec_source=pc_feed"
    
    # 检测平台
    platform = downloader.get_platform(test_url)
    print(f"检测到平台: {platform}")
    
    # 开始下载
    print("开始下载...")
    success = downloader.download_video(test_url)
    
    if success:
        print(f"{success}")
    else:
        print("💥 下载失败！")


if __name__ == "__main__":
    main()        