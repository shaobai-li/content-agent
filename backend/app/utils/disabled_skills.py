"""Per-agent disabled skills state.

Stored at ``<base_dir>/.agent/disabled_skills.json``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Set

from app.core.config import get_agent_base_dir


class DisabledSkills:
    """Tracks which skills are disabled for a particular agent."""

    SKILL_IDS: str = "skill_ids"

    def __init__(self, skill_ids: Set[str]) -> None:
        self._skill_ids = skill_ids

    # ── public helpers ────────────────────────────────────────────

    @property
    def skill_ids(self) -> Set[str]:
        return self._skill_ids

    def is_disabled(self, skill_id: str) -> bool:
        return skill_id in self._skill_ids

    def set_disabled(self, skill_id: str, disabled: bool) -> None:
        if disabled:
            self._skill_ids.add(skill_id)
        else:
            self._skill_ids.discard(skill_id)

    # ── serialization ─────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {self.SKILL_IDS: sorted(self._skill_ids)}

    @classmethod
    def from_dict(cls, data: dict) -> DisabledSkills:
        raw = data.get(cls.SKILL_IDS, [])
        if not isinstance(raw, list):
            raw = []
        return cls(skill_ids={str(x).strip() for x in raw if str(x).strip()})

    # ── I/O ───────────────────────────────────────────────────────

    @staticmethod
    def _state_path(agent_id: str) -> Path:
        base = get_agent_base_dir(agent_id)
        d = base / ".agent"
        d.mkdir(parents=True, exist_ok=True)
        return d / "disabled_skills.json"

    @classmethod
    def load(cls, agent_id: str) -> DisabledSkills:
        try:
            path = cls._state_path(agent_id)
        except (ValueError, KeyError):
            return cls(skill_ids=set())
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                return cls.from_dict(data)
            except (json.JSONDecodeError, OSError):
                pass
        return cls(skill_ids=set())

    def save(self, agent_id: str) -> None:
        try:
            path = self._state_path(agent_id)
        except (ValueError, KeyError):
            return
        path.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
