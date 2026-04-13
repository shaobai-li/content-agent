"""
Agent 注册中心
统一管理所有 Agent 的注册和访问
"""
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from fastapi import UploadFile


@dataclass
class AgentConfig:
    """Agent 配置类"""
    agent_id: str
    system_prompt: str
    handle_chat_stream: Callable
    agent_instance: Optional[Any] = None


# Agent 配置注册表
AGENT_CONFIG_REGISTRY: Dict[str, AgentConfig] = {}


def register_agent(agent_instance):
    """
    注册 agent 实例
    自动从 agent 实例中提取配置信息
    
    Args:
        agent_instance: BaseAgent 的实例
    """
    print("register_agent", agent_instance.agent_id)
    config = AgentConfig(
        agent_id=agent_instance.agent_id,
        system_prompt=agent_instance.system_prompt,
        handle_chat_stream=agent_instance.handle_chat_stream,
        agent_instance=agent_instance,
    )
    AGENT_CONFIG_REGISTRY[config.agent_id] = config


def register_agent_config(config: AgentConfig):
    """注册 agent 配置(兼容旧接口)"""
    AGENT_CONFIG_REGISTRY[config.agent_id] = config


def get_agent_config(agent_id: str) -> Optional[AgentConfig]:
    """获取 agent 配置"""
    return AGENT_CONFIG_REGISTRY.get(agent_id)


def get_agent(agent_id: str):
    """获取 agent 实例"""
    config = get_agent_config(agent_id)
    return config.agent_instance if config else None
