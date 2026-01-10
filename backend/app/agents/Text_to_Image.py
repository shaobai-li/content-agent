import requests
import time
import os

class ImageGenerator:
    def __init__(self):
        self.api_key = os.getenv("IMAGE_API_KEY")
        self.base_url = "https://api.gptsapi.net/api/v3"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    async def generate_and_wait(self, prompt: str, aspect_ratio: str = "1:1"):
        """提交请求并轮询结果，直到成功或失败"""
        # 1. 提交请求
        post_url = f"{self.base_url}/google/gemini-3-pro-image-preview/text-to-image"
        payload = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "output_format": "png"
        }

        try:
            response = requests.post(post_url, headers=self.headers, json=payload)
            if response.status_code != 200:
                return {"error": f"提交失败: {response.text}"}

            result = response.json()
            result_id = result.get("data", {}).get("id")

            if not result_id:
                return {"error": "未获取到任务ID"}

            # 2. 开始轮询 (为了简单，这里使用同步循环，建议生产环境用异步接口)
            get_url = f"{self.base_url}/predictions/{result_id}/result"
            max_retries = 15  # 最多等150秒
            
            for _ in range(max_retries):
                get_response = requests.get(get_url, headers=self.headers)
                data = get_response.json()
                inner_data = data.get("data", {})
                status = inner_data.get("status")

                if status == "completed":
                    return {
                        "status": "success",
                        "images": inner_data.get("outputs", []),
                        "prompt": prompt
                    }
                elif status == "failed":
                    return {"status": "failed", "error": data}
                
                time.sleep(10) # 每10秒查一次
            
            return {"status": "timeout", "error": "生成超时"}

        except Exception as e:
            return {"status": "error", "message": str(e)}