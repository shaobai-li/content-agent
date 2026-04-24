#!/usr/bin/env python3
"""
update.py - 更新备忘录
用法：
  # 更新状态（布尔字段）
  python update.py --id memo-xxx --done
  python update.py --id memo-xxx --undone
  python update.py --id memo-xxx --pin
  python update.py --id memo-xxx --unpin

  # 追加内容
  python update.py --id memo-xxx --append "新增内容"

  # 修改字段
  python update.py --id memo-xxx --title "新标题"
  python update.py --id memo-xxx --content "替换正文"
  python update.py --id memo-xxx --category 工作
  python update.py --id memo-xxx --tags "工作,会议"

  # 模糊匹配（无 id 时按标题关键词匹配第一条）
  python update.py --match "接孩子" --done

  --db PATH  指定 memos.json 路径（默认 ./memos.json）

输出：更新后的记录 JSON
"""

import argparse
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path


def now_iso() -> str:
    tz = timezone(timedelta(hours=8))
    return datetime.now(tz).strftime("%Y-%m-%dT%H:%M:%S+08:00")


def make_excerpt(content: str) -> str:
    return content.replace("\n", "").replace("\r", "")[:100]


def load_db(path: Path) -> list:
    if not path.exists():
        print(json.dumps({"error": "memos.json 不存在"}, ensure_ascii=False))
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_db(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def find_record(records: list, memo_id: str = None, match_kw: str = None):
    if memo_id:
        for r in records:
            if r.get("id") == memo_id:
                return r
        return None
    if match_kw:
        kw = match_kw.lower()
        for r in records:
            title = (r.get("title") or "").lower()
            content = (r.get("content") or "").lower()
            if kw in title or kw in content:
                return r
    return None


def main():
    parser = argparse.ArgumentParser(description="更新备忘录")
    parser.add_argument("--id", default=None)
    parser.add_argument("--match", default=None, help="按标题/内容关键词模糊匹配")
    parser.add_argument("--done", action="store_true")
    parser.add_argument("--undone", action="store_true")
    parser.add_argument("--pin", action="store_true")
    parser.add_argument("--unpin", action="store_true")
    parser.add_argument("--append", default=None, help="追加内容")
    parser.add_argument("--title", default=None)
    parser.add_argument("--content", default=None, help="替换正文")
    parser.add_argument("--category", default=None)
    parser.add_argument("--tags", default=None, help="逗号分隔")
    parser.add_argument("--db", default="./memos.json")
    args = parser.parse_args()

    if not args.id and not args.match:
        print(json.dumps({"error": "需要 --id 或 --match 参数"}, ensure_ascii=False))
        sys.exit(1)

    db_path = Path(args.db)
    records = load_db(db_path)
    record = find_record(records, args.id, args.match)

    if not record:
        key = args.id or args.match
        print(json.dumps({"error": f"未找到记录: {key}"}, ensure_ascii=False))
        sys.exit(1)

    ts = now_iso()

    # 布尔字段
    if args.done:
        record["isDone"] = True
    if args.undone:
        record["isDone"] = False
    if args.pin:
        record["isPinned"] = True
    if args.unpin:
        record["isPinned"] = False
    # 内容操作
    if args.append:
        record["content"] = record.get("content", "") + "\n" + args.append
        record["excerpt"] = make_excerpt(record["content"])
    if args.content:
        record["content"] = args.content
        record["excerpt"] = make_excerpt(args.content)

    # 元数据
    if args.title is not None:
        record["title"] = args.title or None
    if args.category is not None:
        record["category"] = args.category or None
    if args.tags is not None:
        record["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]

    record["updatedAt"] = ts
    save_db(db_path, records)
    print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
