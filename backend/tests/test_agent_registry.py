from unittest.mock import MagicMock
import pytest
from app.runtime.agent_registry import (
    AGENT_CONFIG_REGISTRY,
    AgentConfig,
    register_agent,
    register_agent_config,
    get_agent_config,
    get_agent,
)


class MockAgent:
    agent_id = "test_agent"
    system_prompt = "You are a test agent"

    def handle_chat_stream(self):
        pass


@pytest.fixture(autouse=True)
def clear_registry():
    AGENT_CONFIG_REGISTRY.clear()
    yield
    AGENT_CONFIG_REGISTRY.clear()


# ── register_agent ─────────────────────────────────────────────────────────

def test_register_agent_stores_config():
    agent = MockAgent()
    register_agent(agent)
    config = AGENT_CONFIG_REGISTRY["test_agent"]
    assert config.agent_id == "test_agent"
    assert config.system_prompt == "You are a test agent"
    assert config.agent_instance is agent


def test_register_agent_overwrites_existing():
    agent1 = MockAgent()
    agent2 = MockAgent()
    agent2.system_prompt = "Updated prompt"
    register_agent(agent1)
    register_agent(agent2)
    assert AGENT_CONFIG_REGISTRY["test_agent"].system_prompt == "Updated prompt"


# ── register_agent_config ──────────────────────────────────────────────────

def test_register_agent_config_stores_directly():
    config = AgentConfig(
        agent_id="cfg_agent",
        system_prompt="cfg prompt",
        handle_chat_stream=lambda: None,
    )
    register_agent_config(config)
    assert AGENT_CONFIG_REGISTRY["cfg_agent"] is config


# ── get_agent_config ───────────────────────────────────────────────────────

def test_get_agent_config_returns_config():
    agent = MockAgent()
    register_agent(agent)
    config = get_agent_config("test_agent")
    assert config is not None
    assert config.agent_id == "test_agent"


def test_get_agent_config_missing_returns_none():
    assert get_agent_config("nonexistent") is None


# ── get_agent ──────────────────────────────────────────────────────────────

def test_get_agent_returns_instance():
    agent = MockAgent()
    register_agent(agent)
    assert get_agent("test_agent") is agent


def test_get_agent_missing_returns_none():
    assert get_agent("nonexistent") is None
