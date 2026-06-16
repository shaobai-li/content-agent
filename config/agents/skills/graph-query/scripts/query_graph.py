#!/usr/bin/env python3
"""Graph query CLI — outputs JSON to stdout for Agent parsing."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from graphify_core.query import (  # noqa: E402
    load_graph,
    run_explain,
    run_path,
    run_query,
)


def _emit(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _load_or_error(graph_path: str) -> tuple[object | None, dict | None]:
    try:
        return load_graph(graph_path), None
    except FileNotFoundError as exc:
        return None, {
            "status": "no_graph",
            "max_score": 0,
            "matched_nodes": [],
            "reason": str(exc),
        }
    except (ValueError, json.JSONDecodeError) as exc:
        return None, {
            "status": "no_graph",
            "max_score": 0,
            "matched_nodes": [],
            "reason": f"Graph file invalid or unreadable: {exc}",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Query knowledge graph (JSON stdout)")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--query", action="store_true", help="BFS/DFS subgraph retrieval")
    mode.add_argument("--path", action="store_true", help="Shortest path between concepts")
    mode.add_argument("--explain", action="store_true", help="Explain a node and neighbors")

    parser.add_argument("--graph", required=True, help="Path to graph.json")
    parser.add_argument("--question", default="", help="Question for --query")
    parser.add_argument("--source", default="", help="Source concept for --path")
    parser.add_argument("--target", default="", help="Target concept for --path")
    parser.add_argument("--label", default="", help="Node label for --explain")
    parser.add_argument("--dfs", action="store_true", help="Use DFS instead of BFS")
    parser.add_argument("--depth", type=int, default=3, help="Traversal depth (default 3)")
    parser.add_argument("--budget", type=int, default=2000, help="Token budget (default 2000)")
    parser.add_argument("--max-hops", type=int, default=8, help="Max hops for --path")

    args = parser.parse_args()

    if args.query:
        if not args.question:
            print("error: --query requires --question", file=sys.stderr)
            return 2
        G, err = _load_or_error(args.graph)
        if err:
            _emit({
                **err,
                "mode": "dfs" if args.dfs else "bfs",
                "start_nodes": [],
                "node_count": 0,
                "context": "",
            })
            return 1
        result = run_query(
            G,
            args.question,
            use_dfs=args.dfs,
            depth=args.depth,
            token_budget=args.budget,
        )
        _emit(result)
        return 0 if result["status"] == "ok" else 1

    if args.path:
        if not args.source or not args.target:
            print("error: --path requires --source and --target", file=sys.stderr)
            return 2
        G, err = _load_or_error(args.graph)
        if err:
            _emit(err)
            return 1
        result = run_path(G, args.source, args.target, max_hops=args.max_hops)
        _emit(result)
        return 0 if result["status"] == "ok" else 1

    if args.explain:
        if not args.label:
            print("error: --explain requires --label", file=sys.stderr)
            return 2
        G, err = _load_or_error(args.graph)
        if err:
            _emit(err)
            return 1
        result = run_explain(G, args.label)
        _emit(result)
        return 0 if result["status"] == "ok" else 1

    return 2


if __name__ == "__main__":
    sys.exit(main())
