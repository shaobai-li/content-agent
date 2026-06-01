"""验证当前 FastAPI 实现的端点与 specs/openapi.yaml 规范一致。

设计原则：
- Python 是 API 规范的源（source of truth），FastAPI 自动生成的 /openapi.json 是事实标准
- 本测试确保 specs/openapi.yaml 中定义的路径当前 Python 都已实现
- 如果 Python 实现了新端点但 specs 中未更新，测试会警告（但不强制阻塞，因为 Python 是源）
"""

import sys
from pathlib import Path

import pytest
import yaml

# 将 backend/ 加入 sys.path，使 TestClient 能正确加载 app
BACKEND_DIR = Path(__file__).resolve().parent.parent
SPECS_DIR = BACKEND_DIR.parent / "specs"
OPENAPI_YAML = SPECS_DIR / "openapi.yaml"

sys.path.insert(0, str(BACKEND_DIR))


def load_spec_paths() -> dict:
    """从 specs/openapi.yaml 加载所有路径定义。"""
    if not OPENAPI_YAML.exists():
        pytest.skip(f"规范文件不存在: {OPENAPI_YAML}")

    with open(OPENAPI_YAML, encoding="utf-8") as f:
        spec = yaml.safe_load(f)

    if not spec or "paths" not in spec:
        pytest.fail("specs/openapi.yaml 缺少 paths 定义")

    return spec["paths"]


def get_ported_paths(paths_spec: dict) -> set:
    """从规范 paths 中提取所有 x-status: ported 的端点路径。"""
    ported = set()
    for path, path_item in paths_spec.items():
        if not isinstance(path_item, dict):
            continue
        for method in ("get", "post", "put", "delete", "patch"):
            operation = path_item.get(method)
            if isinstance(operation, dict) and operation.get("x-status") == "ported":
                ported.add(path)
    return ported


class TestOpenAPISpecCoverage:
    """验证 FastAPI 生成的 /openapi.json 与 specs/openapi.yaml 的一致性。"""

    @pytest.fixture(scope="class")
    def generated_paths(self):
        """从 FastAPI TestClient 获取自动生成的 openapi.json 路径列表。"""
        from main import app
        from fastapi.testclient import TestClient

        client = TestClient(app)
        resp = client.get("/openapi.json")
        assert resp.status_code == 200, "FastAPI /openapi.json 应返回 200"
        data = resp.json()
        assert "paths" in data, "FastAPI openapi.json 缺少 paths"
        return set(data["paths"].keys())

    @pytest.fixture(scope="class")
    def spec_paths_dict(self):
        """从 specs/openapi.yaml 加载的路径映射。"""
        return load_spec_paths()

    @pytest.fixture(scope="class")
    def spec_paths(self, spec_paths_dict):
        """specs/openapi.yaml 中定义的所有路径 key。"""
        return set(spec_paths_dict.keys())

    @pytest.fixture(scope="class")
    def ported_paths(self, spec_paths_dict):
        """specs/openapi.yaml 中 x-status: ported 的路径。"""
        return get_ported_paths(spec_paths_dict)

    def test_python_covers_all_spec_paths(self, generated_paths, spec_paths):
        """Python 应至少包含 specs 中定义的所有路径（允许有多余的调试路径）。"""
        missing = spec_paths - generated_paths
        # 检查每个缺失的路径是否需要手动确认
        actually_missing = []
        for path in missing:
            actually_missing.append(path)

        if actually_missing:
            pytest.fail(
                f"Python 缺少规范中定义的 {len(actually_missing)} 个路径:\n"
                + "\n".join(f"  - {p}" for p in sorted(actually_missing))
            )

    def test_spec_covers_all_python_ported_paths(self, generated_paths, ported_paths):
        """已 ported 的路径必须同时在 Python 中已实现。"""
        missing_in_python = ported_paths - generated_paths
        if missing_in_python:
            pytest.fail(
                f"规范中标记为 ported 的 {len(missing_in_python)} 个路径在 Python 中不存在:\n"
                + "\n".join(f"  - {p}" for p in sorted(missing_in_python))
            )

    def test_python_extra_paths_reported(self, generated_paths, spec_paths):
        """Python 中有但 specs 中没有的路径：仅打印警告，不阻塞。

        因为 Python 是源，新端点允许先实现再补规范。
        """
        extra = generated_paths - spec_paths
        # 排除 FastAPI 内置路径
        non_internal = {p for p in extra if not p.startswith("/openapi") and p != "/"}
        if non_internal:
            # 仅警告，不阻塞 — Python 是源
            print(
                f"\n[WARNING] Python 有 {len(non_internal)} 个路径未在 specs 中定义（应同步更新规范）:"
            )
            for p in sorted(non_internal):
                print(f"  - {p}")

    def test_all_ported_paths_have_200_schema(self, spec_paths_dict, ported_paths):
        """所有 ported 路径的 GET/POST 都应定义 200 响应 schema。"""
        missing_schema = []
        for path in ported_paths:
            path_item = spec_paths_dict.get(path, {})
            if not isinstance(path_item, dict):
                continue
            for method in ("get", "post", "put", "delete"):
                operation = path_item.get(method)
                if not isinstance(operation, dict):
                    continue
                if operation.get("x-status") != "ported":
                    continue

                responses = operation.get("responses", {})
                if "200" not in responses:
                    missing_schema.append(f"{method.upper()} {path} (缺少 200 响应定义)")

        if missing_schema:
            pytest.fail(
                "以下 ported 端点缺少 200 响应 schema:\n"
                + "\n".join(f"  - {m}" for m in missing_schema)
            )
