from fastapi import FastAPI
from openai import OpenAI
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
from app.agents.agent_1 import RootAgent
from fastapi.middleware.cors import CORSMiddleware
from app.agents.Text_to_Image import ImageGenerator
import os


load_dotenv()

app = FastAPI(title="Inspiration Library AI", version="1.0.0")
assistant = RootAgent()
image_service = ImageGenerator()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.1.3:3000"], # 允许前端地址
    allow_credentials=True,
    allow_methods=["*"], # 允许所有方法 (POST, GET等)
    allow_headers=["*"], # 允许所有请求头
)

class Message(BaseModel):
    content: str
    agent_id: str

# class DownloadRequest(BaseModel):
#     url: str
#     separate: bool = False

@app.post("/api/chat")
async def chat(request: Message):
    user_content = request.content
    if request.agent_id == "agent1":
        result = await assistant.handle_user_message(user_content)
        return result
    elif request.agent_id == "agent2":
        result = await image_service.generate_and_wait(user_content)
        return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
