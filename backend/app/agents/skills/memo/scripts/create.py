#!/usr/bin/env python3
"""
create.py - 创建备忘录
用法：
  python create.py --title "标题" --content "内容" [选项]

选项：
  --title TEXT        标题（可省略，自动推断）
  --content TEXT      正文内容（必填）
  --tags TAG,TAG      标签，逗号分隔
  --category TEXT     分类：生活/工作/学习/灵感/待办/日记
  --pinned            置顶
  --db PATH           memos.json 路径（默认 ./memos.json）

输出：成功时打印创建的记录 JSON
"""

import argparse
import json
import random
import string
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path


def now_iso() -> str:
    tz = timezone(timedelta(hours=8))
    return datetime.now(tz).strftime("%Y-%m-%dT%H:%M:%S+08:00")


def gen_id(ts: str) -> str:
    date_part = ts[:10].replace("-", "")
    time_part = ts[11:19].replace(":", "")
    suffix = "".join(random.choices(string.ascii_letters + string.digits, k=4))
    return f"memo-{date_part}-{time_part}-{suffix}"


def make_excerpt(content: str) -> str:
    return content.replace("\n", "").replace("\r", "")[:100]


def load_db(path: Path) -> list:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_db(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="创建备忘录")
    parser.add_argument("--title", default=None)
    parser.add_argument("--content", required=False, default=None)
    parser.add_argument("--tags", default=None, help="逗号分隔的标签")
    parser.add_argument("--category", default=None)
    parser.add_argument("--pinned", action="store_true")
    parser.add_argument("--db", default="./memos.json")
    # 支持批量：可多次传 --content，或传 JSON 数组
    parser.add_argument("--batch", default=None, help="批量创建：传入 JSON 数组字符串，每项含 content 等字段")
    args = parser.parse_args()

    db_path = Path(args.db)
    records = load_db(db_path)
    ts = now_iso()

    if not args.batch and not args.content:
        parser.error("--content 是必填项（非批量模式时）")

    if args.batch:
        items = json.loads(args.batch)
        created = []
        for item in items:
            record = build_record(item, ts)
            records.append(record)
            created.append(record)
        save_db(db_path, records)
        print(json.dumps(created, ensure_ascii=False, indent=2))
    else:
        tags = [t.strip() for t in args.tags.split(",")] if args.tags else []
        record = build_record({
            "title": args.title,
            "content": args.content,
            "tags": tags,
            "category": args.category,
            "isPinned": args.pinned,
        }, ts)
        records.append(record)
        save_db(db_path, records)
        print(json.dumps(record, ensure_ascii=False, indent=2))


def build_record(item: dict, ts: str) -> dict:
    memo_id = gen_id(ts)
    content = item.get("content", "")
    return {
        "id": memo_id,
        "title": item.get("title") or None,
        "content": content,
        "excerpt": make_excerpt(content),
        "tags": item.get("tags") or [],
        "category": item.get("category") or None,
        "isPinned": bool(item.get("isPinned") or item.get("pinned", False)),
        "isDone": False,
        "createdAt": ts,
        "updatedAt": ts,
    }


if __name__ == "__main__":
    main()
