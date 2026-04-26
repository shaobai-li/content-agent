---
name: memo
description: 管理个人备忘录、待办、灵感、购物清单、日记。支持创建、追加内容、搜索、列出、标记完成、置顶、归档等操作。当用户说"记一下"、"备忘"、"提醒"、"待办"、"清单"、"日记"、"笔记"、"灵感"时使用此技能。
---
# 个人备忘录系统

所有操作通过调用 `scripts/` 下的 Python 脚本完成，**禁止**直接读写 `memos.json`。

脚本路径基于**本 SKILL.md 所在目录**，例如：
```
python "{SKILL_DIR}/scripts/create.py" --content "内容" --db "./memos.json"
```
`--db` 始终指向$AGENT WORKSPACE下的 `memos/memos.json`。

---

## 创建备忘录 → `scripts/create.py`

**拆分规则（优先判断）：**
- 用户输入含**不同时间点**（"明天"、"后天"、"今晚"等）→ **必须**拆分为多条，用 `--batch` 一次调用
- 同一时间点的多个细节（"买牛奶、鸡蛋"）→ 合并为一条

```bash
# 单条
python create.py --title "标题" --content "内容" --category 待办 --tags "工作,会议" --db ./memos.json

# 批量（不同时间点必须用此方式）
python create.py --batch '[{"title":"开会","content":"..."},{"title":"出差","content":"...","due":"2026-03-25"}]' --db ./memos.json
```

**可选参数：** `--title` `--tags` `--category` `--pinned`

输出：创建的记录 JSON（单条）或数组（批量）

---

## 列出 / 搜索 → `scripts/read.py`

```bash
python read.py --db ./memos.json                     # 列出全部
python read.py --search "关键词" --db ./memos.json   # 搜索
python read.py --id memo-xxx --db ./memos.json        # 查看单条完整内容
python read.py --undone --db ./memos.json             # 仅未完成
python read.py --category 工作 --db ./memos.json      # 按分类筛选
```

输出：摘要字段 JSON 数组（`id` `title` `excerpt` `category` `isPinned` `isDone` `tags` `createdAt`）

---

## 更新 → `scripts/update.py`

```bash
# 状态变更
python update.py --id memo-xxx --done --db ./memos.json
python update.py --match "关键词" --pin --db ./memos.json

# 追加内容
python update.py --id memo-xxx --append "新增内容" --db ./memos.json

# 修改字段
python update.py --id memo-xxx --title "新标题" --db ./memos.json
python update.py --id memo-xxx --tags "工作,紧急" --category 工作 --db ./memos.json
```

**状态标志：** `--done/--undone` `--pin/--unpin`

定位方式：`--id memo-xxx`（精确）或 `--match "关键词"`（模糊匹配标题/内容）

---

## 删除 → `scripts/delete.py`

```bash
python delete.py --id memo-xxx --db ./memos.json
python delete.py --match "关键词" --db ./memos.json
```

**注意：** 执行前先展示标题让用户确认，再调用脚本。

---
**批量创建注意事项（Windows 环境）：**
- 必须使用**双引号**包裹 JSON 字符串
- JSON 内部的双引号必须转义：`\"`
- JSON 必须写成**一行**，不能有换行
- 示例：`--batch "[{\"title\":\"开会\",\"content\":\"开会内容\"}]"`
## 用户交互规范

- **创建后**：一句话确认，显示标题和 id
- **列表**：Markdown 列表呈现，置顶加 📌，已完成加 ~~删除线~~
- **搜索**：显示标题、摘要、标签
- **非必填字段**：不主动询问，由脚本默认处理
