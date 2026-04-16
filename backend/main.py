from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 导入各个 agent 模块（导入即注册）
import app.agents.standard
import app.agents.write_agent
import app.agents.knowledge_base
# 导入统一 API 路由
from app.api.agents import router as agents_router
from app.core.config import AGENTS_CONFIG
from app.service.records_service import ensure_kb_initialized

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


@app.on_event("startup")
async def initialize_agent_knowledge_bases():
    """启动时初始化所有配置了 knowledge_base_file 的 Agent 节点文件。"""
    for agent_id, cfg in AGENTS_CONFIG.items():
        if isinstance(cfg, dict) and cfg.get("knowledge_base_file"):
            ensure_kb_initialized(agent_id)


@app.get("/")
async def root():
    return {
        "status": "running",
        "version": "0.0.1",
        "agents": ["kb", "std", "w"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
