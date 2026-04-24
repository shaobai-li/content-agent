#!/usr/bin/env python3
"""
delete.py - 删除备忘录
用法：
  python delete.py --id memo-xxx
  python delete.py --match "关键词"    # 按标题/内容模糊匹配第一条
  python delete.py --db PATH           # 指定 memos.json 路径

输出：被删除的记录 JSON；未找到时输出 error
"""

import argparse
import json
import sys
from pathlib import Path


def load_db(path: Path) -> list:
    if not path.exists():
        print(json.dumps({"error": "memos.json 不存在"}, ensure_ascii=False))
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_db(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="删除备忘录")
    parser.add_argument("--id", default=None)
    parser.add_argument("--match", default=None, help="按标题/内容关键词模糊匹配")
    parser.add_argument("--db", default="./memos.json")
    args = parser.parse_args()

    if not args.id and not args.match:
        print(json.dumps({"error": "需要 --id 或 --match 参数"}, ensure_ascii=False))
        sys.exit(1)

    db_path = Path(args.db)
    records = load_db(db_path)

    target = None
    if args.id:
        target = next((r for r in records if r.get("id") == args.id), None)
    elif args.match:
        kw = args.match.lower()
        target = next(
            (r for r in records
             if kw in (r.get("title") or "").lower()
             or kw in (r.get("content") or "").lower()),
            None,
        )

    if not target:
        key = args.id or args.match
        print(json.dumps({"error": f"未找到记录: {key}"}, ensure_ascii=False))
        sys.exit(1)

    records = [r for r in records if r.get("id") != target.get("id")]
    save_db(db_path, records)
    print(json.dumps(target, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
