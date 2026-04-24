#!/usr/bin/env python3
"""
read.py - 列出或搜索备忘录
用法：
  python read.py                        # 列出全部
  python read.py --search "关键词"      # 搜索
  python read.py --id memo-xxx          # 查看单条完整内容
  python read.py --done                 # 仅显示已完成
  python read.py --undone               # 仅显示未完成
  python read.py --category 工作        # 按分类筛选
  python read.py --db PATH              # 指定 memos.json 路径

输出：JSON 数组
"""

import argparse
import json
import sys
from pathlib import Path


def load_db(path: Path) -> list:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def sort_records(records: list) -> list:
    return sorted(
        records,
        key=lambda r: (
            not r.get("isPinned", False),
            r.get("isDone", False),
            r.get("createdAt", ""),
        ),
        reverse=False,
    )


def match(record: dict, keyword: str) -> bool:
    kw = keyword.lower()
    fields = [
        record.get("title") or "",
        record.get("content") or "",
        " ".join(record.get("tags") or []),
        record.get("excerpt") or "",
    ]
    return any(kw in f.lower() for f in fields)


def main():
    parser = argparse.ArgumentParser(description="列出或搜索备忘录")
    parser.add_argument("--search", default=None, help="关键词搜索")
    parser.add_argument("--id", default=None, help="查看单条")
    parser.add_argument("--done", action="store_true", help="仅已完成")
    parser.add_argument("--undone", action="store_true", help="仅未完成")
    parser.add_argument("--category", default=None)
    parser.add_argument("--db", default="./memos.json")
    args = parser.parse_args()

    db_path = Path(args.db)
    records = load_db(db_path)

    # 查看单条
    if args.id:
        found = [r for r in records if r.get("id") == args.id]
        if not found:
            print(json.dumps({"error": f"未找到 id={args.id}"}, ensure_ascii=False))
            sys.exit(1)
        print(json.dumps(found[0], ensure_ascii=False, indent=2))
        return

    # 筛选
    result = records
    if args.search:
        result = [r for r in result if match(r, args.search)]
    if args.done:
        result = [r for r in result if r.get("isDone")]
    if args.undone:
        result = [r for r in result if not r.get("isDone")]
    if args.category:
        result = [r for r in result if r.get("category") == args.category]

    result = sort_records(result)

    # 列表模式只输出摘要字段
    summary = []
    for r in result:
        summary.append({
            "id": r.get("id"),
            "title": r.get("title"),
            "excerpt": r.get("excerpt"),
            "category": r.get("category"),
            "isPinned": r.get("isPinned"),
            "isDone": r.get("isDone"),
            "tags": r.get("tags"),
            "createdAt": r.get("createdAt"),
        })

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
