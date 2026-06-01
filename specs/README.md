# API 契约规范

## 概述

本目录包含 OmniAge Content Agent 的 OpenAPI 3.1 契约文件，作为 Python (FastAPI) 和 Rust (Axum) 双端的 API 行为基准。

## 目录结构

```
specs/
├── openapi.yaml            # 主入口规范文件
├── components/
│   ├── schemas.yaml        # 共享数据类型定义
│   ├── parameters.yaml     # 共享路径/查询参数定义
│   └── responses.yaml      # 共享响应定义（错误、成功等）
└── paths/
    ├── agents.yaml         # /api/agents
    ├── sessions.yaml       # /api/agents/{agent_id}/sessions
    ├── messages.yaml       # /api/agents/{agent_id}/sessions/{sid}/messages
    ├── knowledge_bases.yaml# /api/agents/{agent_id}/knowledge-bases
    ├── resources.yaml      # /api/agents/{agent_id}/res/{res_name}
    ├── files.yaml          # /api/agents/{agent_id}/attachments/cache
    ├── chat.yaml           # /api/agents/{agent_id}/chat/stream (SSE)
    ├── agent_config.yaml   # /api/agents/{agent_id}/prompts, /skills
    ├── management.yaml     # /api/management/agents-summary
    └── settings.yaml       # /api/settings/env
```

## x-status 标记

每个端点必须标记以下移植状态之一：

| 状态 | 含义 |
|------|------|
| `ported` | 双端均已实现，通过契约测试验证 |
| `partial` | Python 已实现，Rust 部分实现 |
| `not-started` | 仅 Python 有，Rust 尚未开始 |

## 维护规则

1. **新增 API 端点**：先在对应的 `paths/` 文件中定义规范，标注 `x-status: not-started`
2. **Python 实现完成后**：更新 `x-status` 为 `partial`
3. **Rust 实现完成后**：更新 `x-status` 为 `ported`，并确认 `x-rust-path` 正确
4. **修改已有端点**：同步更新本规范文件，两端通过契约测试后方可合并
5. **SSE 端点**（`x-sse: true`）：契约测试仅验证 HTTP 状态码和 Content-Type，不校验流内容
6. **禁止修改的点**：与业务逻辑无关的自动生成字段（如 `/docs`、`/redoc`、`/openapi.json`）不纳入规范

## 从 FastAPI 导出原始规范

```bash
cd backend
uvicorn main:app --port 8000 &
curl -o ../specs/openapi-raw.json http://localhost:8000/openapi.json
kill %1
```

生成的 `openapi-raw.json` 仅作参考，**不作为正式规范**（已在 `.gitignore` 中排除）。

## 参考

- [OpenAPI 3.1 规范](https://spec.openapis.org/oas/v3.1.0)
- [Python-Rust 同步方案](../takes/2026-06-01_Python-Rust同步方案.md)
- [API 契约测试方案](../takes/2026-06-01_Python-Rust同步方案-方案B_API契约测试.md)
