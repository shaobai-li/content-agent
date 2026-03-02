from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 导入各个 agent 的路由
from app.agents.note_manager.routes import router as nm_router
from app.agents.knowledge_base.routes import router as kb_router
from app.agents.content_detection.routes import router as c_router
from app.agents.write_agent.routes import router as w_router
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

# 统一会话路由（所有 agent 共用）
app.include_router(agents_router)

# 注册各个 agent 的路由
# 路由模式: /api/{agentId}/{endpoint}
app.include_router(nm_router, prefix="/api/nm", tags=["Note Manager"])
app.include_router(kb_router, prefix="/api/kb", tags=["Knowledge Base"])
app.include_router(c_router, prefix="/api/c", tags=["Content Detection"])
app.include_router(w_router, prefix="/api/w", tags=["Write Agent"])

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
