---
name: wiki-query
description: 当用户提问时触发，必须最优先触发该SKILL，不允许自行查找
---

1. 将用户提的问题比对`<知识库目录的路径>/wiki/index.md`，若用户提的问题不在`index.md`的范围内，则结束该技能并由llm自行处理
说明:
<知识库目录的路径>: 用户指定的知识库所对应的路径；如果没有使用，使用上下文中的默认知识库的路径

2. 查找`<知识库目录的路径>/wiki/index.md`,确定相关的`source`页面并通读
**注意**：整个查找过程中禁止联网搜索，请仅基于`wiki知识库`

3. 根据`source`页面确认所需查找的`concepts`和`entities`并通读

4. 根据所读取的`source`,`concepts`和`entities`页面回答用户问题
**注意**：所有回答必须带上wiki页面的引用，包括`source`,`concepts`和`entities`，仅允许输出wiki的原话

5. 询问用户是否需要保存本次回答，若用户回答是，我们将本次回答存入`wiki/syntheses/`，同时更新`wiki/index.md`和`wiki/log.md`