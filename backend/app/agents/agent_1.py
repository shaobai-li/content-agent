from openai import OpenAI
import os
from .xiaohongshu_crawler import XiaohongshuCrawler


SYSTEM_PROMPT = """

"""
class RootAgent:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), base_url="https://api.deepseek.com")
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        self.json_file = "todos.json"
        self.xhs_crawler = XiaohongshuCrawler()

    def generate_response(self, user_content):
        self.messages.append({"role": "user", "content": user_content})
        response = self.client.chat.completions.create(
            model="deepseek-chat",
            messages=self.messages,
        )
            
        ai_content = response.choices[0].message.content 
        self.messages.append({"role": "assistant", "content": ai_content})
        return ai_content



    def handle_user_message(self, user_content: str) -> dict:
            user_content = user_content.strip()

            # Step 1: 用大模型提取纯净小红书URL
            prompt  = """你是一个小红书笔记URL提取助手。你的任务是从用户输入的内容中识别并提取出小红书笔记的纯净URL。

                请严格按照以下规则执行：
                1. 仔细扫描用户输入的全部文本内容
                2. 识别出所有符合URL格式的链接）
                3. 如果找到多个小红书笔记链接，只返回第一个
                4. 只返回纯粹的URL链接
                5. 如果找不到符合条件的小红书笔记URL，返回空字符串 ""

                示例：
                用户输入："帮我提取这个小红书笔记 https://www.xiaohongshu.com/explore/69327271000000001e021002?xsec_token=ABKPhNpGT-KmvTfRRpKLWNgxPMDCtRt6hjnTQ47mrC6cU=&xsec_source=pc_feed"
                你返回："https://www.xiaohongshu.com/explore/69327271000000001e021002?xsec_token=ABKPhNpGT-KmvTfRRpKLWNgxPMDCtRt6hjnTQ47mrC6cU=&xsec_source=pc_feed"
            


                现在请处理当前用户输入："""

            try:
                response = self.client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[
                        {"role": "system", "content": prompt + user_content},
                    ],
                    temperature=0.0,
                    max_tokens=100
                )
                url = response.choices[0].message.content.strip().strip('"')

                # 严格校验格式
                if url:  # 只要大模型返回了非空字符串，就直接用
                    print(f"[Agent] 提取到链接: {url}")
                    return self.xhs_crawler.crawl_note(url)
                    

            except Exception as e:
                print(f"[提取URL失败] {e}")

            # 没有提取到有效链接
            return {
                "message": "未检测到有效的小红书笔记链接，请分享正确的笔记链接～",
                "type": "chat",
                "data": None
            }



