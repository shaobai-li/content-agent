---
title: "Entity名称"
type: entity
entity_type: person | organization | project | .. #可以自行加入新的type
tags: []
sources: []  # 引用该entity的source列表，每次ingest更新
---

## Description
1–2句话定义这个entity是什么/是谁。

## Key Facts
- Fact 1（可核实的客观信息）
- Fact 2
...

## Connections
- [[RelatedEntity]] — 关联关系描述
- [[RelatedConcept]] — 关联关系描述

## Mentions
每次新source提及该entity时，追加一条记录：
- [[source-page-name]] — 在该source中扮演的角色/被提及的上下文