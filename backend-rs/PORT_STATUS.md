# PORT_STATUS — Python → Rust 移植覆盖度追踪

> 维护日期：2026-06-01  
> 关联文档：[Python-Rust 同步方案](../takes/2026-06-01_Python-Rust同步方案.md)

## 状态字段定义

| 状态 | 标记 | 含义 | 日常维护规则 |
|------|------|------|-------------|
| ✅ Ported | 完全移植 | 功能等价，测试通过 | Python 修改此模块必须同步更新 Rust |
| 🔄 In Progress | 移植中 | 代码存在但不完整或未测试 | 优先完成移植 |
| 🔲 Partial | 部分移植 | 核心接口移植了，但缺部分功能/工具 | 标注缺了什么，补齐前按 Not Started 对待 |
| ❌ Not Started | 未开始 | 没有任何对应实现 | 在 Rust 侧排期 |
| N/A (Rust-only) | Rust 独有 | Rust 实现了但 Python 没有 | 标记即可，无需同步 |

## 优先级定义

| 优先级 | 含义 |
|--------|------|
| **P0** | 阻塞 Rust 上线/基础功能必须的模块 |
| **P1** | 重要功能缺失，但 Rust 仍可部分运行 |
| **P2** | 完善性覆盖，不影响核心功能 |

---

## 1. Core 层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `core/config.py` | `core/config.rs` | ✅ Ported | P0 | 配置加载（YAML + env） |
| `core/ids.py` | `core/ids.rs` | ✅ Ported | P0 | UUID 生成 |
| `core/auth.py` | ❌ | ❌ Not Started | P1 | 用户认证、`_user_agents_var`；当前 Rust 未做用户隔离 |
| ❌ | `core/error.rs` | N/A (Rust-only) | — | Rust 统一错误处理，Python 侧无对应需求 |

## 2. API 路由层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `api/agents.py` | `routes/agents.rs` | 🔲 Partial | P0 | Rust 只实现了 `GET /api/agents`（list_agents）。缺少：sessions CRUD、messages 读取、resources 管理、knowledge-bases CRUD、文件上传、chat/stream 路由迁移（chat/stream 已另在 routes/chat.rs 实现） |
| — | `routes/sessions.rs` | ✅ Ported | P0 | sessions 列表 + 删除 |
| — | `routes/messages.rs` | ✅ Ported | P0 | messages 读取 |
| — | `routes/nodes.rs` | ✅ Ported | P0 | nodes 增删改查 |
| — | `routes/knowledge_base.rs` | ✅ Ported | P0 | knowledge-bases 增删查 |
| — | `routes/files.rs` | ✅ Ported | P0 | 文件上传到 cache |
| — | `routes/chat.rs` | ✅ Ported | P0 | SSE 流式聊天（从 agents.py 独立出来） |
| `api/agent_config.py` | ❌ | ❌ Not Started | P1 | 前端所需：prompts 读写（4 个文件）、skills 列表/开关/上传/删除。Rust 缺失整个 API |
| `api/management.py` | ❌ | ❌ Not Started | P1 | `GET /api/management/agents-summary` — 最近有活跃开发的 management 聚合接口 |
| `api/settings.py` | ❌ | ❌ Not Started | P2 | API Key 管理：读取/更新 `.env` 文件中的 provider keys |
| ❌ | `routes/health.rs` | N/A (Rust-only) | — | 健康检查端点，Python 侧无对应需求 |

## 3. Service 层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `service/sessions_service.py` | `service/sessions.rs` | ✅ Ported | P0 | 功能等价 |
| `service/messages_service.py` | `service/messages.rs` | ✅ Ported | P0 | 功能等价 |
| `service/records_service.py` | `service/records.rs` | ✅ Ported | P0 | 功能等价 |
| `service/stream_service.py` | `service/stream.rs` | ✅ Ported | P0 | SSE 流式格式化，功能等价 |
| `service/file_service.py` | `service/files.rs` | ✅ Ported | P0 | 文件上传保存 |
| `service/knowledge_base_registry_service.py` | `service/knowledge_base.rs` | ✅ Ported | P0 | KB 注册管理 |
| `service/agent_chat_service.py` | (内联在 routes/chat.rs + agent/standard.rs) | 🔄 In Progress | P1 | Python 有独立的 `build_standard_llm_messages`/`standard_chat_stream` 函数；Rust 将逻辑内联在路由和 agent 中，功能基本等价但缺 `context_utils` 的 article mention 处理 |
| `service/skill_service.py` | ❌ | ❌ Not Started | P2 | Skill 加载逻辑（调用 skill_loader + disabled_skills），当前 InvokeSkillTool 在 Rust 侧硬编码了 skill 读取路径 |
| `service/chat_service.py` | ❌ | ❌ Not Started | P2 | 仅有 `build_chat_response` 辅助函数，非阻塞 |

## 4. Provider 层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `providers/base.py` | `provider/base.rs` | ✅ Ported | P0 | Provider trait 定义 |
| `providers/registry.py` | `provider/registry.rs` | ✅ Ported | P0 | Provider 注册表 |
| `providers/openai_compat_provider.py` | `provider/openai_compat.rs` | ✅ Ported | P0 | OpenAI 兼容请求构建与流式解析 |
| `providers/factory.py` | ❌ | ❌ Not Started | P1 | Python 的 `create_provider(provider_name)` 工厂函数根据注册表和 env 动态创建 Provider 实例。Rust 当前在 `standard.rs` 中硬编码 `DEEPSEEK_API_KEY` 和 `deepseek-reasoner` 模型 |
| `providers/__init__.py` | ❌ (无对应) | ❌ Not Started | P2 | 仅有模块导出，非必需 |

**关键差异**：Rust 的 Provider 当前硬编码了 `DEEPSEEK_API_KEY` 和 `deepseek-reasoner` 模型，Python 的 factory 支持根据配置动态选择 provider。这是 Rust 达到对等期的关键阻塞项。

## 5. Agent 层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `agents/base_agent.py` | `agent/base.rs` | ✅ Ported | P0 | Agent trait 定义。Python 多了 `get_system_prompt_for_llm()` 方法（调用 skill_loader） |
| `agents/context.py` | `agent/context.rs` | ✅ Ported | P0 | ContextBuilder — system prompt 组装 + skill catalog |
| `agents/hook.py` | `agent/hook.rs` | ✅ Ported | P0 | AgentHook trait |
| `agents/runner.py` | `agent/runner.rs` | ✅ Ported | P0 | AgentRunSpec + AgentRunner 主循环 |
| `runtime/agent_registry.py` | `agent/registry.rs` | ✅ Ported | P0 | Agent 注册、查找 |
| `runtime/agent_turn_context.py` | `agent/turn_context.rs` | ✅ Ported | P0 | AgentTurnContext 数据类 |
| `agents/standard/agent.py` | `agent/standard.rs` | 🔄 In Progress | P1 | 基础 tool loop 已移植。差异：(1) Rust 的 `_get_provider` 硬编码了 deepseek；(2) Rust 缺少 Python 的 `build_canvas_card` 推送（Canvas HTML 集成）；(3) Rust 缺少 `generate_html` 工具及其自动推送逻辑 |
| `agents/standard/streaming_hook.py` | (内联在 `standard.rs`) | ✅ Ported | P1 | 功能等价，Rust 内联为 `StandardStreamingHook` 结构体 |
| `agents/standard/tools.py` | ❌ | ❌ Not Started | P2 | Python 有 agent 级别的 tool 配置逻辑（非必需） |
| `agents/write_agent/agent.py` | ❌ | ❌ Not Started | P2 | 写 Agent 专用逻辑 |
| `agents/content_detection/` | ❌ | ❌ Not Started | — | Python 侧为空目录 |
| `agents/knowledge_base/` | ❌ | ❌ Not Started | — | Python 侧为空目录 |

## 6. Tools 层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `tools/base.py` | `tools/base.rs` | ✅ Ported | P0 | Tool trait + JSON Schema 校验 |
| `tools/registry.py` | `tools/registry.rs` | ✅ Ported | P0 | ToolRegistry 注册/查找/执行 |
| `tools/filesystem.py` | `tools/filesystem.rs` | ✅ Ported | P0 | EditFileTool + ListDirTool 已补齐 |
| `tools/shell.py` | `tools/shell.rs` | ✅ Ported | P0 | RunCommandTool，功能等价 |
| `tools/skill.py` | `tools/skill.rs` | ✅ Ported | P0 | InvokeSkillTool，功能等价 |
| `tools/web.py` | `tools/web.rs` | ✅ Ported | P0 | WebSearchTool + WebFetchTool |
| `tools/file_state.py` | ❌ | ❌ Not Started | P2 | 文件状态追踪工具 |
| `tools/generate_html.py` | ❌ | ❌ Not Started | P1 | HTML 生成工具 — Canvas 功能所需，近期新加。缺少则 Rust 端无法支持 Canvas HTML 卡片 |
| `tools/schema.py` | ❌ (内联在 `tools/base.rs`) | 🔲 Partial | P2 | Python 有独立的 Schema 类型系统（ArraySchema、StringSchema 等），Rust 只在 `tools/base.rs` 实现了 `validate_json_schema_value` 函数。基本功能等价但类型系统更弱 |
| `tools/__init__.py` (create_tool_registry) | `tools/mod.rs` | 🔲 Partial | P0 | Rust `create_tool_registry` 注册了 8 个工具（run_command、read_file、write_file、edit_file、list_dir、web_search、web_fetch、invoke_skill）。Python 注册了 8 个（多 generate_html） |

## 7. Skills / Utils 层

| Python 模块 | Rust 模块 | 状态 | 优先级 | 备注 |
|-------------|-----------|------|--------|------|
| `utils/skill_loader.py` | ❌ | ❌ Not Started | P1 | Skill 发现和 SKILL.md 解析 — `base_agent.get_system_prompt_for_llm` 和 `skill_loader` 被多处依赖 |
| `utils/disabled_skills.py` | ❌ | ❌ Not Started | P2 | 已禁用的 skill 管理 |
| `utils/context_utils.py` | ❌ | ❌ Not Started | P1 | `get_article_context_messages` — mention 解析（article 引用），影响 chat 流的消息构建 |
| `utils/helpers.py` | ❌ | ❌ Not Started | P2 | 杂项辅助函数 |
| `utils/article_parser.py` | ❌ | ❌ Not Started | P2 | 文章解析（文档技能所需） |
| `utils/llm_client.py` | ❌ (provider 已替代) | ✅ N/A | — | Python 的 `deepseek_chat` / `deepseek_chat_stream` 封装在 Rust 中被 provider 层取代 |
| `utils/runtime.py` | ❌ | ❌ Not Started | P2 | 运行时工具 |
| `utils/xml_stream_parser.py` | ❌ | ❌ Not Started | P2 | XML 流式解析器 |
| `agents/skills/ingest-file/` | ❌ | ❌ Not Started | P2 | 文档导入技能（含 PDF、DOCX、PPTX 解析器） |
| `agents/skills/memo/` | ❌ | ❌ Not Started | P2 | 备忘录 CRUD 技能 |

---

## 移植路线图

### 追赶期（当前 → Rust 达到对等）

分 4 个阶段推进：

```
Phase 0: 已有成果（已 ✅ Ported）
  core/config/ids, provider 基础, agent 基础框架, tools 基础,
  routes: sessions/messages/nodes/kb/files/chat/agents(partial),
  service: sessions/messages/records/stream/kb/files
  → 保持同步，禁止 Python 独立修改已 ported 模块

Phase 1: P0 补齐（补齐 partial + 高优缺失）
  ① tools: GenerateHTMLTool + Canvas 推送集成               ← 新功能移植，2-3d
  ② provider: factory 动态 Provider 创建（替代硬编码）         ← 关键，3-5d
  ③ core: auth 基础（用户隔离）                              ← 2-3d
  ④ agent: standard.rs 补齐 provider 注入、Canvas 事件       ← 1-2d

Phase 2: P1 补齐（完整 API 功能 + skill 系统）
  ⑤ api: agent_config — prompts + skills CRUD               ← 3-5d
  ⑥ api: management — agents-summary 接口                    ← 1-2d
  ⑦ utils: skill_loader — skill 发现/解析                    ← 3-5d
  ⑧ utils: context_utils — mention/article 上下文处理         ← 1-2d

Phase 3: P2 完善（全面功能对等）
  ⑨ api: settings — env key 管理                            ← 1-2d
  ⑩ tools: file_state                                       ← 1d
  ⑪ skills: ingest-file / memo                               ← 5-7d
  ⑫ utils: article_parser, helpers, xml_stream_parser 等     ← 2-3d
  ⑬ agents: write_agent                                     ← 3-5d
```

### 对等期（Rust ≈ Python）
- 新功能在设计时就必须考虑两边实现
- 优先在 Rust 中实现，Python 作为 backup
- 关键 API 端点要先写 OpenAPI spec

### 领先期（Rust 成为主代码库）
- Python 冻结，仅维护性修改
- Rust 独善其身

---

## 日常维护流程

### PORT_STATUS.md 更新规则

每次 PR 涉及 Python 或 Rust 的模块变更时：

| 场景 | 操作 |
|------|------|
| 修改了 ❌ Not Started 的 Python 模块 | 在 PORT_STATUS.md 的 "最近变更" 栏备注：`2026-MM-DD: xxx.py 新增了 Y 功能` |
| 修改了 ✅ Ported 的 Python 模块 | **必须** 同时提交 Rust 对应修改，否则 CI 禁止合并 |
| 新建了 Python 模块 | 在 PORT_STATUS.md 新增一行，标记 ❌ Not Started |
| 完成了一个模块的移植 | 将状态从 🔄/❌ 改为 ✅，@ 相关开发者确认 |
| 修改了 Rust 已有模块（非移植） | 检查组对应的 Python 模块是否需要反向同步 |

---

## 工具与流程

| 项目 | 关联文件 | 状态 | 优先级 | 完成日期 |
|------|---------|------|--------|---------|
| CI 集成 | `.github/workflows/contract-tests.yml` + `contract-tests/` | ✅ Done | P2 | 2026-06-01 |

---

## 最近变更

| 日期 | 变更 |
|------|------|
| 2026-06-01 | 初始化 PORT_STATUS.md，建立覆盖度矩阵和契约测试框架 |
| 2026-06-02 | P02: 配置 CI 流水线（contract-tests.yml）+ Python 两端一致性测试框架 |
| 2026-06-02 | P03: 实现 EditFileTool + ListDirTool，更新 tools/mod.rs 注册 |
