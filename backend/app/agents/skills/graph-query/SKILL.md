---
name: graph-query
description: 当用户提问或者要求讲解时必须最优先触发该SKILL，不允许自行查找，例如：xxx是怎么回事，给我讲讲xxx；基于知识库 graph/ 图谱检索并回答；若脚本未找到匹配节点则立即结束技能，由 Agent 自行处理。
---

# Graph Query（知识图谱查询技能）

1. **硬前置**：确认 `<知识库目录的路径>/graph/graph.json` 存在。
若不存在 → 输出「图谱未构建，请先使用 build-knowledge-graph 技能建图」并**立即结束本技能**。
说明:
<知识库目录的路径>: 用户指定的知识库路径；若未指定，使用上下文中的默认知识库路径。
**注意**：默认知识库路径在上下文中，不需要工具查看。若用户指定了知识库名称，去 `databases.json` 寻找路径。
**注意**：若用户指定了错误的知识库名称或路径，必须提醒用户并立即停止，绝对不能使用默认数据库。
**注意**：若用户既未指定知识库路径，上下文中也没有默认知识库路径，必须提醒「默认知识库未设置」并立即停止。

2. **提取查询关键词**：读取 `<知识库目录的路径>/graph/GRAPH_REPORT.md`，对照其中 God Nodes 和 Communities 的节点名，将用户问题映射为图谱中实际存在的 2-4 个英文节点名，拼成一个空格分隔的查询字符串 `<query_terms>`。
- **重要**：必须使用 GRAPH_REPORT.md 中出现的**完整节点名**（如 `Attention Mechanism`），不要截取子串（如仅用 `Attention`），以确保脚本端精确匹配。
- 若确认图谱中没有任何节点与用户问题相关 → **立即结束本技能**，由 Agent 自行回答。
- 多个关键词合并为一个字符串，不分多次查询。

3. **图检索**（根据问题形态选择子命令）：
**注意**：`cwd=skills`，`skill_name=graph-query`。

**一般探索**（默认）：
```
python scripts\query_graph.py --query --question "<query_terms>" --graph <知识库目录的路径>\graph\graph.json
```
可选：`--dfs`（深度优先，depth 上限 6）、`--depth 3`（BFS 默认 3）、`--budget 2000`。

**「A 和 B 什么关系」类**：
```
python scripts\query_graph.py --path --source "<A的英文节点名>" --target "<B的英文节点名>" --graph <知识库目录的路径>\graph\graph.json
```

**「解释 X 是什么」类**：
```
python scripts\query_graph.py --explain --label "<X的英文节点名>" --graph <知识库目录的路径>\graph\graph.json
```

解析 stdout JSON：
- `status` 为 `no_graph` / `no_match` / `no_source` / `no_target` / `no_path` → **立即结束本技能**，由 Agent 自行回答用户。
- `status` 为 `same_node` → 来源与目标为同一节点，提示用户后由 Agent 自行回答。
- `status` 为 `ok` → 进入步骤 5。

4. **作答规范**：
- **仅依据**脚本返回 JSON 中 `context` 字段的 NODE/EDGE 内容作答。
- 引用 `source_file`、`source_location`。
- 标注边的置信度类型：**EXTRACTED** / **INFERRED** / **AMBIGUOUS**。
- 信息不足时明确说明，**禁止编造边或节点**。
- 禁止联网搜索；禁止读取 wiki 或其他非 graph 目录内容作答。

5. **可选收尾**：若用户希望保存本次 Q&A，写入 `<知识库目录的路径>/graph/memory/query_<timestamp>.md`，并追加 `<知识库目录的路径>/graph/log.md`。
