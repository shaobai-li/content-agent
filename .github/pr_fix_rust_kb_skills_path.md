## 概述
为 Rust 后端（backend-rs）修复知识库路径与 skills 执行目录解析，以实现与 Python 端一致的数据布局，并让 Agent 能正确获取默认知识库路径及执行 bundled skills 脚本。

## 改动说明
- 修复 `get_agent_local_data_dir` 路径由 `{base}/knowledge_base/` 调整为 `{base}/.local/knowledge_base/`，与 Python 端对齐
- 修复 `ContextBuilder::build_kb_env_line` 占位实现，改为读取 `databases.json` 首条记录并注入 `AGENT_DEFAULT_KB` 到 system prompt
- 修复 `run_command` 在 `cwd=skills` 时仅查找 `{base}/skills/` 的问题，增加 `config/agents/skills/` bundled skills 回退解析
- 调整 `bundled_skills_dir` 为公开函数，供 shell 工具复用

## 实现目的
- 保持 Rust 与 Python 后端在用户数据目录结构上的路径一致性
- 支持 ingest-file、build-knowledge-graph 等技能依赖默认知识库路径的场景
- 修复 bundled skills（如 build-knowledge-graph）执行时报 `Skills directory not found` 的错误
- 消除 Agent system prompt 中 `AGENT_DEFAULT_KB=无` 的误导性占位输出
