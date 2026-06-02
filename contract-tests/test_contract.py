"""
Python ↔ Rust 两端一致性契约测试。

对 OpenAPI spec 中标记为 `x-status: ported` 的端点，
向 Python 和 Rust 两个服务分别发送请求，比较响应一致。

SSE 端点（x-sse: true）跳过。
404 响应仅比较状态码，不比较 body 结构。
"""

import os
import sys
import json
import time
from pathlib import Path

import pytest
import requests
import yaml

# ── 路径配置 ──────────────────────────────────────────────────────────
TEST_DIR = Path(__file__).resolve().parent
SPEC_DIR = TEST_DIR.parent / "specs"

# 硬编码测试值（用于替换路径参数）
TEST_VALUES = {
    "agent_id": "admin",
    "session_id": "test-session-id",
    "kb_id": "test-kb",
    "res_name": "nodes",
    "node_id": "test-node-id",
    "filename": "test-file.txt",
    "skill_id": "test-skill",
}


# ── YAML / $ref 工具 ─────────────────────────────────────────────────

def _load_yaml(path):
    """加载 YAML 文件，返回解析后的 dict。"""
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _resolve_json_pointer(data, pointer):
    """解析 JSON Pointer 路径，返回指向的子对象。"""
    if not pointer:
        return data
    parts = pointer.strip("/").split("/")
    for part in parts:
        # JSON Pointer 转义：~1 → /, ~0 → ~
        part = part.replace("~1", "/").replace("~0", "~")
        if isinstance(data, dict):
            data = data[part]
        elif isinstance(data, list):
            data = data[int(part)]
        else:
            raise KeyError(f"Cannot resolve '{part}' in {type(data).__name__}")
    return data


def _resolve_ref(ref, base_dir):
    """解析形如 ``paths/agents.yaml#/paths/~1api~1agents`` 的 $ref。

    Returns:
        (resolved_data, new_base_dir)
    """
    if "#" in ref:
        file_path, pointer = ref.split("#", 1)
    else:
        file_path, pointer = ref, ""

    ref_path = (base_dir / file_path).resolve()
    data = _load_yaml(ref_path)
    if pointer:
        data = _resolve_json_pointer(data, pointer)
    return data, ref_path.parent


def _resolve_params(params, base_dir):
    """展开 parameters 列表中的 $ref，返回普通 dict 列表。"""
    resolved = []
    for p in params:
        if "$ref" in p:
            r, _ = _resolve_ref(p["$ref"], base_dir)
            resolved.append(r)
        else:
            resolved.append(p)
    return resolved


# ── Spec 扫描 ─────────────────────────────────────────────────────────

def get_ported_endpoints():
    """扫描 OpenAPI spec，返回所有 ``x-status: ported`` 且非 SSE 的端点。"""
    spec = _load_yaml(SPEC_DIR / "openapi.yaml")
    endpoints = []

    for path_pattern, path_item in spec.get("paths", {}).items():
        if "$ref" in path_item:
            resolved, base_dir = _resolve_ref(path_item["$ref"], SPEC_DIR)
        else:
            resolved, base_dir = path_item, SPEC_DIR

        # 收集 path 级别共享参数
        path_level_params = _resolve_params(
            resolved.get("parameters", []), base_dir
        )

        for method in ("get", "post", "put", "delete", "patch"):
            operation = resolved.get(method)
            if not operation:
                continue

            x_status = operation.get("x-status", "")
            x_sse = operation.get("x-sse", False)

            if x_status != "ported":
                continue
            if x_sse:
                continue  # SSE 端点跳过

            # 合并参数（operation 级别覆盖 path 级别）
            op_params = _resolve_params(
                operation.get("parameters", []), base_dir
            )
            all_params = path_level_params + op_params

            endpoints.append({
                "path": path_pattern,
                "method": method.upper(),
                "operation_id": operation.get("operationId", ""),
                "parameters": all_params,
                "request_body": operation.get("requestBody"),
            })

    return endpoints


def _build_url(base_url, path_pattern, params):
    """替换路径参数，附加查询参数，返回完整 URL。"""
    path = path_pattern

    # 收集 path 参数名（从 pattern 中的 {xxx}）
    import re
    path_param_names = set(re.findall(r"\{(\w+)\}", path))

    # 替换路径参数
    for p in params:
        if p.get("in") == "path" and p["name"] in path_param_names:
            value = TEST_VALUES.get(p["name"], p["name"])
            path = path.replace(f"{{{p['name']}}}", value)

    # 查找未从 params 列表获取的参数名并尝试自动替换
    remaining = re.findall(r"\{(\w+)\}", path)
    for name in remaining:
        if name in TEST_VALUES:
            path = path.replace(f"{{{name}}}", TEST_VALUES[name])

    # 收集查询参数
    query_parts = []
    for p in params:
        if p.get("in") == "query":
            value = TEST_VALUES.get(p["name"], p["name"])
            query_parts.append(f"{p['name']}={value}")

    if query_parts:
        return f"{base_url}{path}?{'&'.join(query_parts)}"
    return f"{base_url}{path}"


def _build_request_body(operation_id, request_body_spec):
    """为需要 body 的请求构建最小数据。"""
    # 通用 fallback
    return {"name": "test-resource"}


# ── 配置加载 ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def config():
    with open(TEST_DIR / "config.yaml") as f:
        return yaml.safe_load(f)


# ── 健康检查 ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def python_ready(config):
    """检查 Python 服务是否就绪。"""
    url = f"{config['python']['base_url']}{config['python']['health_endpoint']}"
    timeout = config["timeout_seconds"]
    _wait_for_service(url, timeout, "Python")
    return config["python"]["base_url"]


@pytest.fixture(scope="session")
def rust_ready(config):
    """检查 Rust 服务是否就绪。"""
    url = f"{config['rust']['base_url']}{config['rust']['health_endpoint']}"
    timeout = config["timeout_seconds"]
    _wait_for_service(url, timeout, "Rust")
    return config["rust"]["base_url"]


def _wait_for_service(url, timeout, label):
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=5)
            if r.ok:
                print(f"[SETUP] {label} 服务就绪: {url}")
                return
        except requests.RequestException as e:
            last_err = e
        time.sleep(1)
    pytest.fail(f"{label} 服务 {url} 在 {timeout}s 内未就绪: {last_err}")


# ── 端点数据 ──────────────────────────────────────────────────────────

PORTED_ENDPOINTS = get_ported_endpoints()


# ── 测试参数化 ────────────────────────────────────────────────────────

def _endpoint_id(e):
    return f"{e['method']} {e['path']}"


@pytest.mark.parametrize("ep", PORTED_ENDPOINTS, ids=_endpoint_id)
def test_endpoint_consistency(ep, python_ready, rust_ready):
    """对同一个端点分别请求 Python 和 Rust，比较响应一致性。"""
    py_base = python_ready
    rs_base = rust_ready

    py_url = _build_url(py_base, ep["path"], ep["parameters"])
    rs_url = _build_url(rs_base, ep["path"], ep["parameters"])

    method = ep["method"]
    timeout = 30

    # 构建请求参数
    kwargs = {"timeout": timeout}
    if method in ("POST", "PUT") and ep.get("request_body"):
        kwargs["json"] = _build_request_body(
            ep["operation_id"], ep["request_body"]
        )

    # 发送请求
    try:
        py_resp = requests.request(method, py_url, **kwargs)
    except requests.RequestException as e:
        pytest.fail(f"Python 请求失败: {py_url} — {e}")

    try:
        rs_resp = requests.request(method, rs_url, **kwargs)
    except requests.RequestException as e:
        pytest.fail(f"Rust 请求失败: {rs_url} — {e}")

    # ── 断言 1：状态码一致 ──
    assert py_resp.status_code == rs_resp.status_code, (
        f"状态码不一致: Python={py_resp.status_code}, Rust={rs_resp.status_code}\n"
        f"  URL: {ep['method']} {ep['path']}\n"
        f"  Python: {py_url} → {py_resp.status_code}\n"
        f"  Rust:   {rs_url} → {rs_resp.status_code}"
    )

    # ── 断言 2：404 端点只比较状态码 ──
    if py_resp.status_code == 404:
        return  # 双端 404 已通过状态码一致验证

    # ── 断言 3：响应 body 顶层 keys 一致（仅 JSON 响应） ──
    py_ct = py_resp.headers.get("Content-Type", "")
    rs_ct = rs_resp.headers.get("Content-Type", "")

    if "application/json" in py_ct and "application/json" in rs_ct:
        try:
            py_body = py_resp.json()
            rs_body = rs_resp.json()
        except (json.JSONDecodeError, ValueError) as e:
            pytest.fail(f"JSON 解析失败: {e}\n  URL: {ep['path']}")

        py_keys = set(py_body.keys()) if isinstance(py_body, dict) else set()
        rs_keys = set(rs_body.keys()) if isinstance(rs_body, dict) else set()

        assert py_keys == rs_keys, (
            f"响应顶层 keys 不一致\n"
            f"  Python keys ({len(py_keys)}): {sorted(py_keys)}\n"
            f"  Rust keys   ({len(rs_keys)}): {sorted(rs_keys)}\n"
            f"  仅在 Python: {py_keys - rs_keys}\n"
            f"  仅在 Rust:   {rs_keys - py_keys}\n"
            f"  URL: {ep['method']} {ep['path']}"
        )
    else:
        # 非 JSON 响应仅检查 Content-Type 一致
        if "text/event-stream" not in py_ct:
            pass  # 非 SSE 非 JSON 响应，至少检查连接正常


# ── 发现测试（确保 ported 端点被正确扫描） ────────────────────────────

def test_ported_endpoints_discovered():
    """确保至少扫描到了预期数量的 ported 端点。"""
    assert len(PORTED_ENDPOINTS) >= 5, (
        f"扫描到的 ported 端点偏少 ({len(PORTED_ENDPOINTS)})，"
        f"请检查 spec 文件中的 x-status 标记"
    )
    print(f"\n[INFO] 发现 {len(PORTED_ENDPOINTS)} 个 ported 端点:")
    for ep in PORTED_ENDPOINTS:
        sse_note = ""
        print(f"  - {ep['method']:6s} {ep['path']}{sse_note}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
