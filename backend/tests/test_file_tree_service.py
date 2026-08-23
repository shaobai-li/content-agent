import pytest

from app.service.file_tree_service import (
    build_workspace_tree,
    read_workspace_file,
    write_workspace_file,
)


@pytest.fixture
def ws(tmp_path, monkeypatch):
    """构造临时 workspace 并 monkeypatch get_agent_workspace_dir。"""
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "README.md").write_text("# hello", encoding="utf-8")
    (tmp_path / "SYSTEM.md").write_text("system", encoding="utf-8")
    (tmp_path / ".local").mkdir()
    (tmp_path / ".local" / "sessions.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(
        "app.service.file_tree_service.get_agent_workspace_dir",
        lambda _: tmp_path,
    )
    return tmp_path


def test_build_workspace_tree(ws):
    tree = build_workspace_tree("std")
    assert tree["id"] == "root"
    assert tree["type"] == "folder"
    assert tree["path"] == ""

    names = {c["name"] for c in tree["children"]}
    assert {"docs", "SYSTEM.md", ".local"} <= names

    docs = next(c for c in tree["children"] if c["name"] == "docs")
    assert docs["type"] == "folder"
    assert docs["children"][0]["name"] == "README.md"
    assert docs["children"][0]["type"] == "file"
    assert docs["children"][0]["path"] == "docs/README.md"
    assert "size" in docs["children"][0]
    assert "modifiedAt" in docs["children"][0]


def test_read_workspace_file(ws):
    assert read_workspace_file("std", "docs/README.md") == "# hello"


def test_read_workspace_file_outside(ws):
    with pytest.raises(Exception) as exc:
        read_workspace_file("std", "../secret.txt")
    assert exc.value.status_code == 400


def test_read_workspace_file_missing(ws):
    with pytest.raises(Exception) as exc:
        read_workspace_file("std", "nope.md")
    assert exc.value.status_code == 404


def test_read_workspace_file_too_large(ws):
    (ws / "big.bin").write_bytes(b"x" * (1_000_001))
    with pytest.raises(Exception) as exc:
        read_workspace_file("std", "big.bin")
    assert exc.value.status_code == 413


def test_write_workspace_file(ws):
    result = write_workspace_file("std", "docs/README.md", "# updated")
    assert result["ok"] is True
    assert result["path"] == "docs/README.md"
    assert result["size"] > 0
    assert "modifiedAt" in result
    assert read_workspace_file("std", "docs/README.md") == "# updated"


def test_write_workspace_file_outside(ws):
    with pytest.raises(Exception) as exc:
        write_workspace_file("std", "../secret.txt", "x")
    assert exc.value.status_code == 400


def test_write_workspace_file_missing(ws):
    with pytest.raises(Exception) as exc:
        write_workspace_file("std", "nope.md", "x")
    assert exc.value.status_code == 404


def test_write_workspace_file_too_large(ws):
    with pytest.raises(Exception) as exc:
        write_workspace_file("std", "docs/README.md", "x" * (1_000_001))
    assert exc.value.status_code == 413


def _make_app():
    from fastapi import FastAPI
    from app.api.agents import router

    app = FastAPI()
    app.include_router(router)
    return app


def test_update_workspace_file_content_requires_string(monkeypatch):
    """PUT 校验 content 必须为字符串：缺失/非字符串 → 400 且不调用写入。"""
    from fastapi.testclient import TestClient

    called = {"n": 0}

    def fake_write(agent_id, path, content):
        called["n"] += 1
        return {"ok": True, "path": path, "size": 0, "modifiedAt": ""}

    monkeypatch.setattr("app.service.file_tree_service.write_workspace_file", fake_write)

    client = TestClient(_make_app())
    url = "/api/agents/std/files/content?path=SYSTEM.md"

    resp = client.put(url, json={})
    assert resp.status_code == 400
    assert called["n"] == 0

    resp = client.put(url, json={"content": 123})
    assert resp.status_code == 400
    assert called["n"] == 0

    resp = client.put(url, json={"content": "# ok"})
    assert resp.status_code == 200
    assert called["n"] == 1
