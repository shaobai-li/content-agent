import os
import sys
import logging

from dotenv import load_dotenv

load_dotenv()

from loguru import logger


# ── 桥接：stdlib logging → loguru ──
class _InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        logger_opt = logger.opt(depth=6, exception=record.exc_info)
        logger_opt.log(record.levelname, record.getMessage())


def _setup_loguru(level: str) -> None:
    logger.remove()
    logger.add(sys.stderr, level=level)
    # 替换 uvicorn 命名 logger 的 handler（必须在 uvicorn.run 之前）
    for log_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        log = logging.getLogger(log_name)
        log.handlers = [_InterceptHandler()]
        log.propagate = False


# ── 日志等级控制 ──
# 默认显示 INFO 及以上；APP_VERBOSE=1 时显示 DEBUG 及以上
_log_level = "DEBUG" if os.getenv("APP_VERBOSE", "").lower() in ("1", "true", "yes") else "INFO"
_setup_loguru(_log_level)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

# 导入各个 agent 模块（自定义 agent，导入即注册）
import app.agents.standard
import app.agents.write_agent

# 导入统一 API 路由
from app.api.agents import router as agents_router, list_router as agents_list_router
from app.api.agent_config import router as agent_config_router
from app.core.auth import require_user_id
from app.core.config import AGENTS_CONFIG
from app.runtime.agent_registry import AGENT_CONFIG_REGISTRY, register_agent
from app.service.knowledge_base_registry_service import list_knowledge_bases
from app.service.records_service import ensure_kb_initialized


def _register_agents_from_yaml_config():
    """自动注册 config/agents/*.yaml 中尚未注册的 agent。

    已通过 import 注册的（如 std、w）会被跳过；
    纯 YAML 定义的 StandardAgent 在此自动创建并注册。
    """
    for agent_id, cfg in AGENTS_CONFIG.items():
        if agent_id in AGENT_CONFIG_REGISTRY:
            continue  # 已在 import 阶段注册

        if not isinstance(cfg, dict):
            continue

        class_path = cfg.get("class", "")
        if class_path:
            import importlib
            module_path, class_name = class_path.rsplit(".", 1)
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            instance = cls(agent_id=agent_id)
        else:
            # 未指定 class → 默认 StandardAgent
            from app.agents.standard.agent import StandardAgent
            instance = StandardAgent(agent_id=agent_id)

        register_agent(instance)
        logger.info("auto-register {} → StandardAgent", agent_id)


_register_agents_from_yaml_config()

logger.info("app started, agents={}", list(AGENTS_CONFIG.keys()))

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

# 统一 API 路由（包含 agent 列表 + chat、sessions、messages、config）
app.include_router(agents_list_router, dependencies=[Depends(require_user_id)])
app.include_router(agents_router, dependencies=[Depends(require_user_id)])
app.include_router(agent_config_router, dependencies=[Depends(require_user_id)])


@app.on_event("startup")
async def initialize_agent_knowledge_bases():
    """启动时初始化注册表中已有的知识库节点文件。"""
    for agent_id, cfg in AGENTS_CONFIG.items():
        if isinstance(cfg, dict) and cfg.get("knowledge_base_file"):
            for database in list_knowledge_bases(agent_id):
                kb_id = database.get("id")
                if isinstance(kb_id, str) and kb_id:
                    ensure_kb_initialized(agent_id, kb_id)


@app.get("/")
async def root():
    return {
        "status": "running",
        "version": "0.0.1",
        "agents": list(AGENTS_CONFIG.keys()),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)
