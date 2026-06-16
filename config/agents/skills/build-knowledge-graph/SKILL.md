---
name: build-knowledge-graph
description: 当用户上传文章（md/txt/pdf）并表达「建图」、「知识图谱」、「追加到图谱」、「graphify」等意图时，必须直接使用该技能，不允许先查看文件。
---

# Build Knowledge Graph（知识图谱构建技能）

1. 使用 `<上传的附件文件路径>` 作为输入文件路径
说明:
<知识库目录的路径>: 用户指定的知识库路径；若未指定，使用上下文中的默认知识库路径。
**注意**：默认知识库路径在上下文中，不需要工具查看。若用户指定了知识库名称，去 `databases.json` 寻找路径。
**注意**：若用户指定了错误的知识库名称或路径，必须提醒用户并立即停止，绝对不能使用默认数据库。
**注意**：若用户既未指定知识库路径，上下文中也没有默认知识库路径，必须提醒「默认知识库未设置」并立即停止。

2. 确认 `<知识库目录的路径>/graph/` 目录存在，若不存在则创建：
```
mkdir <知识库目录的路径>\graph\
mkdir <知识库目录的路径>\templates\
```
并复制模板到对应目录：
```
cp templates\extraction_schema.md <知识库目录的路径>\templates
```
**注意**：`cwd=skills`，`skill_name=build-knowledge-graph`。

3. 对每个附件依次运行：
```
python scripts\import.py --i <上传的附件文件路径> --o <知识库目录的路径>
```
**注意**：若 stdout JSON 中 `status` 为 `duplicate`，**立即停止**，不再继续建图。

4. 从步骤 3 的 JSON 输出读取文档路径并完整读取：若存在 `parsed_path` 则读取该 parsed.md；否则读取 `source_path` 指向的原始文件。

5. 阅读 `<知识库目录的路径>\templates\extraction_schema.md`，学习语义抽取 JSON 格式。

6. 若 `<知识库目录的路径>/graph/graph.json` 已存在，读取其中节点 ID 与社区摘要，抽取时避免 ID 冲突。

7. 根据步骤 4 读取的全部文档内容，参照 `extraction_schema.md` 完成语义抽取，写入 `<知识库目录的路径>/graph/extraction.json`。

8. 运行建图脚本：
```
python scripts\build_graph.py --i <知识库目录的路径>\graph\extraction.json --o <知识库目录的路径>\graph\ --append
```
说明：若 `graph.json` 不存在则自动首次建图；若用户明确要求全量重建，改用 `--rebuild` 替代 `--append`。

9. 读取 `<知识库目录的路径>/graph/.graphify_analysis.json`，为每个 community 写 2–5 个词的标签，保存到 `<知识库目录的路径>/graph/community_labels.json`（格式见 `extraction_schema.md` 社区命名节），然后重新生成报告与 HTML 可视化：
```
python scripts\build_graph.py --i <知识库目录的路径>\graph\extraction.json --o <知识库目录的路径>\graph\ --labels <知识库目录的路径>\graph\community_labels.json --labels-only
```
说明：脚本会同时更新 `GRAPH_REPORT.md` 和 `graph.html`。

10. 读取 `<知识库目录的路径>/graph/GRAPH_REPORT.md`，向用户汇报：节点数、边数、社区变化、跨文档惊喜连接、建议探索的问题。

11. 更新 `<知识库目录的路径>/graph/log.md`（若不存在则创建），记录本次建图摘要。
