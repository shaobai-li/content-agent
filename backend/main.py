from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 导入各个 agent 模块（导入即注册）
import app.agents.content_detection
import app.agents.write_agent

# 导入统一 API 路由
from app.api.agents import router as agents_router

app = FastAPI(
    title="OmniAge System",
    description="多 Agent 的 AI 系统平台",
    version="0.0.1"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://192.168.1.3:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 统一 API 路由（包含 chat、sessions、messages）
app.include_router(agents_router)


@app.get("/")
async def root():
    return {
        "status": "running",
        "version": "0.0.1",
        "agents": ["nm", "kb", "c", "w"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
