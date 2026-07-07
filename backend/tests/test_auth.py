import os
from unittest.mock import patch

import pytest
from app.core.auth import get_current_user_id, require_user_id
from app.core.config import parse_system_md_frontmatter


class TestGetCurrentUserId:
    def test_requires_request_context(self):
        """无请求上下文时，get_current_user_id() 抛出 LookupError。"""
        with pytest.raises(LookupError):
            get_current_user_id()


@pytest.mark.asyncio
class TestRequireUserId:
    async def test_missing_header_raises_401(self):
        """无 X-User-Id header → 401。"""
        request = _mock_request(headers={})
        with pytest.raises(Exception) as exc:
            await require_user_id(request)
        assert exc.value.status_code == 401

    async def test_empty_header_raises_401(self):
        """X-User-Id 为空 → 401。"""
        request = _mock_request(headers={"x-user-id": ""})
        with pytest.raises(Exception) as exc:
            await require_user_id(request)
        assert exc.value.status_code == 401

    async def test_sets_user_id_from_header(self):
        """有效的 X-User-Id → user_id 设入 contextvar。"""
        request = _mock_request(headers={"x-user-id": "1"})
        await require_user_id(request)
        assert get_current_user_id() == "1"

    async def test_loads_user_agent_configs(self):
        """require_user_id 加载该用户的 custom agent 配置。"""
        request = _mock_request(headers={"x-user-id": "99"})
        with patch("app.core.auth._load_user_agent_configs", return_value={"my-agent": {"name": "测试"}}):
            await require_user_id(request)
        assert get_current_user_id() == "99"


class TestLoadUserAgentConfigs:
    def test_nonexistent_dir_returns_empty(self):
        """用户目录不存在时返回空 dict。"""
        from app.core.auth import _load_user_agent_configs
        result = _load_user_agent_configs("nonexistent_user")
        assert result == {}

    def test_loads_system_md_files(self, tmp_path):
        """正常扫描用户目录下的 SYSTEM.md 文件。"""
        from app.core.auth import _load_user_agent_configs
        import app.core.auth as m
        original = m.DEFAULT_DATA_DIR
        try:
            m.DEFAULT_DATA_DIR = tmp_path
            agent_dir = tmp_path / "u_1" / "my-agent"
            agent_dir.mkdir(parents=True)
            (agent_dir / "SYSTEM.md").write_text(
                "---\nname: 测试\nskills:\n  - web-search\n---\n\nbody text",
                encoding="utf-8",
            )
            result = _load_user_agent_configs("1")
            assert "my-agent" in result
            assert result["my-agent"]["name"] == "测试"
        finally:
            m.DEFAULT_DATA_DIR = original


def _mock_request(headers: dict):
    """构造一个伪 FastAPI Request 对象（仅含 .headers 属性）。"""
    from types import SimpleNamespace
    class _Headers:
        def get(self, key: str, default: str = "") -> str:
            # 大小写不敏感匹配
            for k, v in headers.items():
                if k.lower() == key.lower():
                    return v
            return default
    return SimpleNamespace(headers=_Headers())
