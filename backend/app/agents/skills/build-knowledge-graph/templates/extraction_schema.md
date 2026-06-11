# 语义抽取 JSON 规范（extraction.json）

Agent 读取 `raw/m_*/parsed.md` 后，按本规范写出 `{知识库}/graph/extraction.json`。该文件是建图脚本的唯一输入。

## 顶层结构

```json
{
  "nodes": [],
  "edges": [],
  "hyperedges": [],
  "input_tokens": 0,
  "output_tokens": 0
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodes` | array | 是 | 概念/实体节点列表 |
| `edges` | array | 是 | 二元关系边列表 |
| `hyperedges` | array | 否 | 多元关系（3+ 节点共同参与的模式） |
| `input_tokens` | number | 否 | 本次抽取消耗的输入 token 数 |
| `output_tokens` | number | 否 | 本次抽取消耗的输出 token 数 |

---

## 节点（nodes）

每篇文章场景 `file_type` 固定为 `document` 或 `paper`（PDF/学术论文用 `paper`，其余用 `document`）。

```json
{
  "id": "article_title_transformer",
  "label": "Transformer",
  "file_type": "document",
  "source_file": "article_title.md",
  "source_location": "§3.1"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 节点唯一 ID，见下方规则 |
| `label` | string | 是 | 人类可读名称 |
| `file_type` | string | 是 | `document` 或 `paper` |
| `source_file` | string | 是 | 来源文件名（与 `parsed.md` 对应的原文件名） |
| `source_location` | string | null | 可选，章节/段落位置 |

### 节点 ID 规则

- 格式：`{stem}_{entity}`，全小写，仅允许 `[a-z0-9_]`
- `stem` = 文件名去掉扩展名，非字母数字替换为 `_`
- `entity` = 概念/实体名规范化（同上）
- 示例：`attention-paper.pdf` 中的「Attention Mechanism」→ `attention_paper_attention_mechanism`
- **禁止**追加 chunk 序号后缀（`_c1`、`_chunk2` 等）
- 若 `{kb}/graph/graph.json` 已存在，读取其中已有节点 ID，**避免冲突**

### 抽取原则（文章）

- 提取文中出现的**命名概念、关键实体、重要论点**
- 为「为何做出某决策、权衡、设计意图」等 rationale，写在相关概念节点的属性上，**不要**单独建 rationale 碎片节点
- 仅对真正的命名实体或概念建节点

---

## 边（edges）

```json
{
  "source": "article_title_transformer",
  "target": "article_title_attention_mechanism",
  "relation": "conceptually_related_to",
  "confidence": "INFERRED",
  "confidence_score": 0.75,
  "source_file": "article_title.md",
  "weight": 1.0
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `source` | string | 是 | 源节点 ID（必须存在于 nodes） |
| `target` | string | 是 | 目标节点 ID（必须存在于 nodes） |
| `relation` | string | 是 | 关系类型，见下方 |
| `confidence` | string | 是 | `EXTRACTED` / `INFERRED` / `AMBIGUOUS` |
| `confidence_score` | number | 是 | 0.0–1.0，见下方规则 |
| `source_file` | string | 是 | 该边依据的来源文件 |
| `source_location` | string | null | 可选 |
| `weight` | number | 否 | 默认 1.0 |

### 关系类型（文章场景常用）

| relation | 含义 |
|----------|------|
| `references` | 文中明确引用另一概念 |
| `cites` | 引用外部文献/来源 |
| `conceptually_related_to` | 概念层面相关 |
| `semantically_similar_to` | 语义相似、解决同类问题但无显式结构链接 |
| `rationale_for` | 某决策/设计的原因 |

### 置信度规则

| confidence | 含义 | confidence_score |
|------------|------|------------------|
| `EXTRACTED` | 文中明确写出（引用、定义、直接陈述） | **固定 1.0** |
| `INFERRED` | 合理推断（隐含依赖、共享结构） | 0.6–0.9；弱推断 0.4–0.5 |
| `AMBIGUOUS` | 不确定，需人工复核 | 0.1–0.3 |

**禁止**对所有边统一使用 0.5 默认值；每条 INFERRED 边应单独评估。

### 语义相似边（semantically_similar_to）

当两个概念解决同一问题或表达同一思想，但文中无显式引用关系时，可添加此边，标记 `INFERRED`，`confidence_score` 0.6–0.95。仅用于**非显而易见**的跨概念相似，不要用于琐碎重复。

---

## 超边（hyperedges，可选）

当 3 个及以上节点共同参与一个模式、流程或主题，且二元边无法充分表达时，可添加超边。每份语料最多 3 条。

```json
{
  "id": "auth_flow_components",
  "label": "Authentication Flow",
  "nodes": ["doc_login_handler", "doc_token_validator", "doc_session_store"],
  "relation": "participate_in",
  "confidence": "INFERRED",
  "confidence_score": 0.75,
  "source_file": "auth_design.md"
}
```

| relation | 含义 |
|----------|------|
| `participate_in` | 共同参与某流程/模式 |
| `implement` | 共同实现某接口/协议 |
| `form` | 共同构成某整体概念 |

---

## Deep Mode（可选）

若用户要求深度建图，对 INFERRED 边更积极：捕捉间接依赖、共享假设、潜在耦合；不确定的标 `AMBIGUOUS` 而非省略。

---

## 完整示例

```json
{
  "nodes": [
    {"id": "ml_basics_transformer", "label": "Transformer", "file_type": "document", "source_file": "ml_basics.md", "source_location": null},
    {"id": "ml_basics_attention", "label": "Attention Mechanism", "file_type": "document", "source_file": "ml_basics.md", "source_location": "§2"},
    {"id": "ml_basics_self_attention", "label": "Self-Attention", "file_type": "document", "source_file": "ml_basics.md", "source_location": "§2.1"}
  ],
  "edges": [
    {"source": "ml_basics_transformer", "target": "ml_basics_attention", "relation": "references", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": "ml_basics.md", "weight": 1.0},
    {"source": "ml_basics_attention", "target": "ml_basics_self_attention", "relation": "conceptually_related_to", "confidence": "EXTRACTED", "confidence_score": 1.0, "source_file": "ml_basics.md", "weight": 1.0},
    {"source": "ml_basics_transformer", "target": "ml_basics_self_attention", "relation": "semantically_similar_to", "confidence": "INFERRED", "confidence_score": 0.7, "source_file": "ml_basics.md", "weight": 1.0}
  ],
  "hyperedges": [],
  "input_tokens": 0,
  "output_tokens": 0
}
```

---

## 社区命名（建图后由 Agent 完成）

`build_graph.py` 运行后会生成 `{kb}/graph/.graphify_analysis.json`。Agent 读取其中每个 community 的节点列表，为每个社区写 **2–5 个词** 的英文或中文标签（如「Attention Mechanism」「训练流程」），写入 `{kb}/graph/community_labels.json`：

```json
{"0": "Attention Mechanism", "1": "Training Pipeline"}
```

然后重新运行 `build_graph.py` 并传入 `--labels`，以更新 `GRAPH_REPORT.md`。
