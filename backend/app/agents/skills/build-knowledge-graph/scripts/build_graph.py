from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import networkx as nx
from networkx.readwrite import json_graph

from graphify_core.analyze import god_nodes, surprising_connections, suggest_questions
from graphify_core.build import build_from_json, build_merge
from graphify_core.cluster import cluster, score_all
from graphify_core.export import to_json
from graphify_core.report import generate
from graphify_core.validate import assert_valid


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="从 extraction.json 构建知识图谱")
    parser.add_argument("--i", "--input", dest="input_file", required=True, help="extraction.json 路径")
    parser.add_argument("--o", "--output", dest="output_dir", required=True, help="graph 输出目录")
    parser.add_argument("--append", action="store_true", help="追加合并到已有 graph.json")
    parser.add_argument("--rebuild", action="store_true", help="忽略已有 graph.json，全量重建")
    parser.add_argument("--labels", dest="labels_file", default=None, help="community_labels.json 路径")
    parser.add_argument(
        "--labels-only",
        action="store_true",
        help="仅根据已有 graph.json 与 community_labels 重新生成报告（不重新建图）",
    )
    return parser.parse_args(argv)


def load_extraction(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    assert_valid(data)
    return data


def load_labels(path: Path | None) -> dict[int, str] | None:
    if path is None or not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {int(k): str(v) for k, v in raw.items()}


def detection_from_extraction(extraction: dict) -> dict:
    source_files = {
        n.get("source_file", "")
        for n in extraction.get("nodes", [])
        if isinstance(n, dict) and n.get("source_file")
    }
    source_files.discard("")
    return {
        "total_files": len(source_files),
        "total_words": 0,
    }


def load_graph_from_json(graph_path: Path) -> nx.Graph:
    data = json.loads(graph_path.read_text(encoding="utf-8"))
    try:
        return json_graph.node_link_graph(data, edges="links")
    except TypeError:
        return json_graph.node_link_graph(data)


def regenerate_report(
    graph_dir: Path,
    extraction: dict,
    labels: dict[int, str],
) -> dict:
    graph_path = graph_dir / "graph.json"
    analysis_path = graph_dir / ".graphify_analysis.json"
    if not graph_path.exists():
        raise FileNotFoundError(f"graph.json 不存在: {graph_path}")
    if not analysis_path.exists():
        raise FileNotFoundError(f".graphify_analysis.json 不存在: {analysis_path}")

    graph = load_graph_from_json(graph_path)
    analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    communities = {int(k): v for k, v in analysis["communities"].items()}
    cohesion = {int(k): float(v) for k, v in analysis["cohesion"].items()}
    tokens = {
        "input": extraction.get("input_tokens", 0),
        "output": extraction.get("output_tokens", 0),
    }
    gods = analysis.get("gods") or god_nodes(graph)
    surprises = analysis.get("surprises") or surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)
    detection = detection_from_extraction(extraction)
    kb_root = graph_dir.parent.name

    report = generate(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        tokens,
        kb_root,
        suggested_questions=questions,
    )
    (graph_dir / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")

    return {
        "ok": True,
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "communities": len(communities),
        "graph_path": str(graph_path),
        "report_path": str(graph_dir / "GRAPH_REPORT.md"),
        "mode": "labels_only",
    }


def build_graph(
    extraction: dict,
    graph_dir: Path,
    *,
    append: bool = False,
    rebuild: bool = False,
    labels: dict[int, str] | None = None,
) -> dict:
    graph_dir.mkdir(parents=True, exist_ok=True)
    graph_path = graph_dir / "graph.json"

    use_merge = append and graph_path.exists() and not rebuild
    if use_merge:
        graph = build_merge([extraction], graph_path)
    else:
        graph = build_from_json(extraction)

    if graph.number_of_nodes() == 0:
        raise ValueError("图谱为空：extraction 未产生任何节点")

    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    tokens = {
        "input": extraction.get("input_tokens", 0),
        "output": extraction.get("output_tokens", 0),
    }
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)

    if labels:
        community_labels = labels
    else:
        community_labels = {cid: f"Community {cid}" for cid in communities}

    questions = suggest_questions(graph, communities, community_labels)
    detection = detection_from_extraction(extraction)
    kb_root = graph_dir.parent.name
    report = generate(
        graph,
        communities,
        cohesion,
        community_labels,
        gods,
        surprises,
        detection,
        tokens,
        kb_root,
        suggested_questions=questions,
    )

    (graph_dir / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(graph_path), force=rebuild)

    analysis = {
        "communities": {str(k): v for k, v in communities.items()},
        "cohesion": {str(k): v for k, v in cohesion.items()},
        "gods": gods,
        "surprises": surprises,
        "questions": questions,
    }
    (graph_dir / ".graphify_analysis.json").write_text(
        json.dumps(analysis, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return {
        "ok": True,
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "communities": len(communities),
        "graph_path": str(graph_path),
        "report_path": str(graph_dir / "GRAPH_REPORT.md"),
        "analysis_path": str(graph_dir / ".graphify_analysis.json"),
        "mode": "append" if use_merge else "rebuild" if rebuild else "fresh",
    }


def main() -> int:
    args = parse_args()
    try:
        extraction = load_extraction(Path(args.input_file))
        graph_dir = Path(args.output_dir)
        labels = load_labels(Path(args.labels_file) if args.labels_file else None)

        if args.labels_only:
            if not labels:
                raise ValueError("--labels-only 需要同时提供 --labels")
            result = regenerate_report(graph_dir, extraction, labels)
        else:
            result = build_graph(
                extraction,
                graph_dir,
                append=args.append,
                rebuild=args.rebuild,
                labels=labels,
            )
    except Exception as exc:
        result = {"ok": False, "error": str(exc)}
        print(json.dumps(result, ensure_ascii=False))
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
