from openai import OpenAI
import os
import json
from .crawler import Crawler


SYSTEM_PROMPT = """你是一个 URL 提取助手。

你的任务：
从用户输入中识别并提取出“第一个”URL，并按照规定的 JSON 格式输出结果。

规则（必须严格遵守）：
1) 扫描用户输入的全部文本，识别所有符合 URL 格式的链接（必须以 http:// 或 https:// 开头）
2) 如果找到多个 URL，只返回第一个
3) 只输出 JSON，不要添加任何解释、注释、额外文字或换行
4) JSON 中只允许一个字段
5) 如果找不到任何 URL，url 字段必须是空字符串 ""

JSON 输出格式（必须严格一致）：
{
  "url": "<提取到的第一个URL或空字符串>"
}

示例 1：
输入：帮我提取这个 https://www.xiaohongshu.com/explore/xxx?abc=1
输出：
{
  "url": "https://www.xiaohongshu.com/explore/xxx?abc=1"
}

示例 2：
输入：这段话里没有链接
输出：
{
  "url": ""
}
"""
class NoteManager:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), base_url="https://api.deepseek.com")
        self.messages = []
        self.json_file = "todos.json"
        self.crawler = Crawler()

    def generate_response(self, user_content):
        self.messages.append({"role": "system", "content": SYSTEM_PROMPT})
        self.messages.append({"role": "user", "content": user_content})
        response = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=self.messages,
        )
            
        ai_content = response.choices[0].message.content 
        return ai_content

    async def handle_user_message(self, user_content: str) -> dict:
        user_content = user_content.strip()

        
        try:
            resp = self.generate_response(user_content)

            # 解析 JSON
            data = json.loads(resp)
            url = data.get("url", "")

            # 只要返回了非空 URL，就直接用
            if url:
                print(f"[Agent] 提取到链接: {url}")
                return await self.crawler.crawl_note(url)

            else:
                return {
                    "reply": "未检测到有效URL，请分享正确的URL～"
                }

        except Exception as e:
            print(f"[提取URL失败] {e}")



