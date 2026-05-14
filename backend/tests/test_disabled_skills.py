"""Tests for disabled skills state management and API endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from app.utils.disabled_skills import DisabledSkills


# ── DisabledSkills unit tests ─────────────────────────────────────


def test_load_returns_empty_when_no_file(tmp_path):
    with patch("app.utils.disabled_skills.get_agent_base_dir", return_value=tmp_path):
        ds = DisabledSkills.load("test-agent")
        assert ds.skill_ids == set()


def test_save_and_load_roundtrip(tmp_path):
    with patch("app.utils.disabled_skills.get_agent_base_dir", return_value=tmp_path):
        ds = DisabledSkills.load("test-agent")
        ds.set_disabled("skill1", True)
        ds.set_disabled("skill2", True)
        ds.save("test-agent")

        ds2 = DisabledSkills.load("test-agent")
        assert ds2.is_disabled("skill1") is True
        assert ds2.is_disabled("skill2") is True
        assert ds2.is_disabled("skill3") is False

        # Verify file content
        state_path = tmp_path / ".agent" / "disabled_skills.json"
        assert state_path.is_file()
        data = json.loads(state_path.read_text(encoding="utf-8"))
        assert data["skill_ids"] == ["skill1", "skill2"]


def test_set_disabled_toggle():
    ds = DisabledSkills(skill_ids=set())
    ds.set_disabled("sk", True)
    assert "sk" in ds.skill_ids
    ds.set_disabled("sk", False)
    assert "sk" not in ds.skill_ids


def test_is_disabled():
    ds = DisabledSkills(skill_ids={"a", "b"})
    assert ds.is_disabled("a") is True
    assert ds.is_disabled("c") is False


def test_to_dict():
    ds = DisabledSkills(skill_ids={"b", "a"})
    result = ds.to_dict()
    assert result["skill_ids"] == ["a", "b"]


def test_from_dict():
    ds = DisabledSkills.from_dict({"skill_ids": ["x", "y"]})
    assert ds.skill_ids == {"x", "y"}
    assert ds.is_disabled("x") is True


def test_from_dict_ignores_invalid():
    ds = DisabledSkills.from_dict({})
    assert ds.skill_ids == set()

    ds = DisabledSkills.from_dict({"skill_ids": "not-a-list"})
    assert ds.skill_ids == set()


def test_load_handles_missing_agent():
    """load() should not crash when agent doesn't exist in config."""
    ds = DisabledSkills.load("__nonexistent_agent__")
    assert ds.skill_ids == set()


# ── discover_skills_for_agent with disabled filtering ─────────────

from app.utils.skill_loader import discover_skills_for_agent, SkillHead


def test_discover_filters_disabled_skills():
    """disabled_skills 参数应过滤掉对应的 skill_id。"""
    fake_head = SkillHead("sk1", "bundled", "Skill 1", "Desc", Path("/fake/SKILL.md"))
    with patch("app.utils.skill_loader.get_agent_skill_ids", return_value=["sk1", "sk2"]):
        with patch("app.utils.skill_loader.bundled_skills_dir", return_value=Path("/fake/bundled")):
            with patch.object(Path, "is_file", return_value=True):
                with patch("app.utils.skill_loader.read_skill_head",
                           side_effect=lambda sid, p, s: SkillHead(sid, s, f"Skill {sid}", "Desc", p)):
                    with patch("app.utils.skill_loader.get_agent_base_dir", return_value=Path("/fake/agent")):
                        with patch.object(Path, "is_dir", return_value=False):
                            result = discover_skills_for_agent(
                                "agent1", disabled_skills={"sk1"}
                            )
                            # sk1 should be filtered out, sk2 should remain
                            ids = [h.skill_id for h in result]
                            assert "sk1" not in ids
                            assert "sk2" in ids


# ── API endpoint integration tests ────────────────────────────────

from fastapi.testclient import TestClient
from app.core.config import AGENTS_CONFIG


def _make_app():
    """Create a minimal FastAPI app with the config router for testing."""
    from fastapi import FastAPI
    from app.api.agent_config import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client():
    app = _make_app()
    return TestClient(app)


@pytest.fixture
def agent_id():
    # Use an agent that exists in the test config
    for aid in AGENTS_CONFIG:
        return aid
    return "std"  # fallback


class TestPromptsAPI:
    def test_list_prompts(self, client, agent_id, tmp_path):
        prompts_dir = tmp_path / "prompts"
        prompts_dir.mkdir(parents=True, exist_ok=True)

        with patch("app.api.agent_config.get_agent_base_dir", return_value=tmp_path):
            resp = client.get(f"/api/agents/{agent_id}/prompts")
            assert resp.status_code == 200
            data = resp.json()
            assert "files" in data
            for fname in ["AGENTS.md", "SOUL.md", "USER.md", "system_prompt.md"]:
                assert fname in data["files"]

    def test_save_prompt(self, client, agent_id, tmp_path):
        prompts_dir = tmp_path / "prompts"
        prompts_dir.mkdir(parents=True, exist_ok=True)

        with patch("app.api.agent_config.get_agent_base_dir", return_value=tmp_path):
            resp = client.put(
                f"/api/agents/{agent_id}/prompts/AGENTS.md",
                json={"content": "hello world"},
            )
            assert resp.status_code == 200
            assert resp.json()["ok"] is True
            # Verify file was written
            assert (prompts_dir / "AGENTS.md").read_text(encoding="utf-8") == "hello world"

    def test_save_prompt_invalid_filename(self, client, agent_id, tmp_path):
        with patch("app.api.agent_config.get_agent_base_dir", return_value=tmp_path):
            resp = client.put(
                f"/api/agents/{agent_id}/prompts/NOT_ALLOWED.md",
                json={"content": "test"},
            )
            assert resp.status_code == 400

    def test_save_prompt_missing_content(self, client, agent_id):
        resp = client.put(
            f"/api/agents/{agent_id}/prompts/AGENTS.md",
            json={},
        )
        assert resp.status_code == 400  # Custom validation for missing content


class TestSkillsAPI:
    def test_list_skills(self, client, agent_id):
        resp = client.get(f"/api/agents/{agent_id}/skills")
        assert resp.status_code == 200
        data = resp.json()
        assert "skills" in data
        assert isinstance(data["skills"], list)

    def test_toggle_disable(self, client, agent_id, tmp_path):
        with patch("app.utils.disabled_skills.get_agent_base_dir", return_value=tmp_path):
            # First, disable a skill
            resp = client.put(
                f"/api/agents/{agent_id}/skills/some-skill/disable",
                json={"disabled": True},
            )
            assert resp.status_code == 200
            assert resp.json()["ok"] is True

            # Verify persisted
            state_path = tmp_path / ".agent" / "disabled_skills.json"
            assert state_path.is_file()
            data = json.loads(state_path.read_text(encoding="utf-8"))
            assert "some-skill" in data["skill_ids"]

    def test_toggle_disable_invalid_body(self, client, agent_id):
        """disabled 必须是布尔值"""
        resp = client.put(
            f"/api/agents/{agent_id}/skills/some-skill/disable",
            json={"disabled": "not-a-bool"},
        )
        assert resp.status_code == 400

    def test_delete_user_skill(self, client, agent_id, tmp_path):
        """创建一个 user skill，然后删除它"""
        skills_dir = tmp_path / "skills" / "my-test-skill"
        skills_dir.mkdir(parents=True, exist_ok=True)
        (skills_dir / "SKILL.md").write_text(
            "---\nname: my-test-skill\ndescription: A test skill\n---\n# Body",
            encoding="utf-8",
        )

        with patch("app.api.agent_config.get_agent_base_dir", return_value=tmp_path):
            with patch("app.utils.skill_loader.get_agent_base_dir", return_value=tmp_path):
                with patch("app.api.agent_config.get_agent_config", return_value={"base_dir": "."}):
                    resp = client.delete(f"/api/agents/{agent_id}/skills/my-test-skill")
                    assert resp.status_code == 200

    def test_upload_skill(self, client, agent_id, tmp_path):
        with patch("app.api.agent_config.get_agent_base_dir", return_value=tmp_path):
            resp = client.post(
                f"/api/agents/{agent_id}/skills/upload",
                json={
                    "folder_name": "my-uploaded-skill",
                    "files": {
                        "SKILL.md": "---\nname: my-uploaded-skill\ndescription: Uploaded\n---\n# Body",
                    },
                },
            )
            assert resp.status_code == 200
            assert resp.json()["ok"] is True
            # Verify files written
            skill_dir = tmp_path / "skills" / "my-uploaded-skill"
            assert (skill_dir / "SKILL.md").is_file()

    def test_upload_skill_invalid_name(self, client, agent_id):
        resp = client.post(
            f"/api/agents/{agent_id}/skills/upload",
            json={
                "folder_name": "invalid name!!",
                "files": {
                    "SKILL.md": "---\nname: invalid name!!\ndescription: Test\n---\n# Body",
                },
            },
        )
        assert resp.status_code == 400
        assert "符号" in resp.json()["detail"]

    def test_upload_skill_name_mismatch(self, client, agent_id):
        resp = client.post(
            f"/api/agents/{agent_id}/skills/upload",
            json={
                "folder_name": "folder-name",
                "files": {
                    "SKILL.md": "---\nname: different-name\ndescription: Test\n---\n# Body",
                },
            },
        )
        assert resp.status_code == 400
        assert "不一致" in resp.json()["detail"]

    def test_upload_skill_duplicate(self, client, agent_id, tmp_path):
        skills_dir = tmp_path / "skills" / "dup-skill"
        skills_dir.mkdir(parents=True, exist_ok=True)

        with patch("app.api.agent_config.get_agent_base_dir", return_value=tmp_path):
            resp = client.post(
                f"/api/agents/{agent_id}/skills/upload",
                json={
                    "folder_name": "dup-skill",
                    "files": {
                        "SKILL.md": "---\nname: dup-skill\ndescription: Duplicate\n---\n# Body",
                    },
                },
            )
            assert resp.status_code == 409
