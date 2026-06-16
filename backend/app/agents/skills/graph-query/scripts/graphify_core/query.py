# Graph query core — ported from graphify serve.py
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import networkx as nx
from networkx.readwrite import json_graph

from .security import sanitize_label


def strip_diacritics(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def load_graph(graph_path: str) -> nx.Graph:
    resolved = Path(graph_path).resolve()
    if resolved.suffix != ".json":
        raise ValueError(f"Graph path must be a .json file, got: {graph_path!r}")
    if not resolved.exists():
        raise FileNotFoundError(f"Graph file not found: {resolved}")
    data = json.loads(resolved.read_text(encoding="utf-8"))
    try:
        return json_graph.node_link_graph(data, edges="links")
    except TypeError:
        return json_graph.node_link_graph(data)


def _norm_label(data: dict, nid: str) -> str:
    return data.get("norm_label") or strip_diacritics(data.get("label") or nid).lower()


def question_terms(text: str) -> list[str]:
    normalized = strip_diacritics(text).lower()
    terms: list[str] = []
    for token in re.split(r"\s+", normalized):
        token = token.strip(".,，。！？、；：""''「」『』（）()[]{}?!.;:/\\|")
        if token and len(token) > 2 and token not in terms:
            terms.append(token)
        # Extract sub-tokens from compound terms (e.g., "transformer-attention")
        for part in re.split(r"[-_]", token):
            part = part.strip(".,，。！？、；：""''「」『』（）()[]{}?!.;:/\\|")
            if part and len(part) > 2 and part not in terms:
                terms.append(part)
    return terms


def score_nodes(G: nx.Graph, terms: list[str], *, norm_text: str = "") -> list[tuple[float, float, str]]:
    """Return (total_score, label_score, node_id) sorted by total_score desc."""
    scored: list[tuple[float, float, str]] = []
    norm_terms = [strip_diacritics(t).lower() for t in terms]
    norm_text = strip_diacritics(norm_text).lower()
    for nid, data in G.nodes(data=True):
        norm_label = _norm_label(data, nid)
        source = (data.get("source_file") or "").lower()
        label_score = sum(1 for t in norm_terms if t in norm_label)
        if norm_text and norm_label and len(norm_label) > 2 and norm_label in norm_text:
            label_score += 2
        source_score = sum(0.5 for t in norm_terms if t in source)
        total = label_score + source_score
        if total > 0:
            scored.append((total, label_score, nid))
    return sorted(scored, key=lambda x: x[0], reverse=True)


def resolve_start_nodes(G: nx.Graph, text: str) -> list[tuple[float, float, str]]:
    terms = question_terms(text)
    scored = score_nodes(G, terms, norm_text=text)
    if scored:
        return scored
    for nid in find_node(G, text):
        return [(1.0, 1.0, nid)]
    return []


def bfs(G: nx.Graph, start_nodes: list[str], depth: int) -> tuple[set[str], list[tuple]]:
    visited: set[str] = set(start_nodes)
    frontier = set(start_nodes)
    edges_seen: list[tuple] = []
    for _ in range(depth):
        next_frontier: set[str] = set()
        for n in frontier:
            for neighbor in G.neighbors(n):
                if neighbor not in visited:
                    next_frontier.add(neighbor)
                    edges_seen.append((n, neighbor))
        visited.update(next_frontier)
        frontier = next_frontier
    return visited, edges_seen


def dfs(G: nx.Graph, start_nodes: list[str], depth: int) -> tuple[set[str], list[tuple]]:
    visited: set[str] = set()
    edges_seen: list[tuple] = []
    stack = [(n, 0) for n in reversed(start_nodes)]
    while stack:
        node, d = stack.pop()
        if node in visited or d > depth:
            continue
        visited.add(node)
        for neighbor in G.neighbors(node):
            if neighbor not in visited:
                stack.append((neighbor, d + 1))
                edges_seen.append((node, neighbor))
    return visited, edges_seen


def subgraph_to_text(
    G: nx.Graph, nodes: set[str], edges: list[tuple], token_budget: int = 2000
) -> str:
    char_budget = token_budget * 3
    lines = []
    for nid in sorted(nodes, key=lambda n: G.degree(n), reverse=True):
        d = G.nodes[nid]
        line = (
            f"NODE {sanitize_label(d.get('label', nid))} "
            f"[src={d.get('source_file', '')} loc={d.get('source_location', '')} "
            f"community={d.get('community', '')}]"
        )
        lines.append(line)
    for u, v in edges:
        if u in nodes and v in nodes:
            raw = G[u][v]
            d = next(iter(raw.values()), {}) if isinstance(G, (nx.MultiGraph, nx.MultiDiGraph)) else raw
            line = (
                f"EDGE {sanitize_label(G.nodes[u].get('label', u))} "
                f"--{d.get('relation', '')} [{d.get('confidence', '')}]--> "
                f"{sanitize_label(G.nodes[v].get('label', v))}"
            )
            lines.append(line)
    output = "\n".join(lines)
    if len(output) > char_budget:
        output = output[:char_budget] + f"\n... (truncated to ~{token_budget} token budget)"
    return output


def find_node(G: nx.Graph, label: str) -> list[str]:
    """Find node IDs whose label or ID contains *term* as a substring.

    Uses case-insensitive substring matching (e.g. "trans" matches
    "transformer", "translation"). Callers should pass precise node names
    from GRAPH_REPORT.md for best results.
    """
    term = strip_diacritics(label).lower()
    return [
        nid
        for nid, d in G.nodes(data=True)
        if term in (d.get("norm_label") or strip_diacritics(d.get("label") or "").lower())
        or term == nid.lower()
    ]


def run_query(
    G: nx.Graph,
    question: str,
    *,
    use_dfs: bool = False,
    depth: int = 3,
    token_budget: int = 2000,
) -> dict:
    scored = resolve_start_nodes(G, question)
    if not scored:
        return {
            "status": "no_match",
            "mode": "dfs" if use_dfs else "bfs",
            "start_nodes": [],
            "node_count": 0,
            "context": "",
            "reason": "No matching nodes found.",
        }
    start_nids = [nid for _, _, nid in scored[:3]]
    start_labels = [G.nodes[n].get("label", n) for n in start_nids]
    traverse_depth = min(depth, 6)
    if use_dfs:
        nodes, edges = dfs(G, start_nids, traverse_depth)
        mode = "dfs"
    else:
        nodes, edges = bfs(G, start_nids, traverse_depth)
        mode = "bfs"
    context = subgraph_to_text(G, nodes, edges, token_budget=token_budget)
    return {
        "status": "ok",
        "mode": mode,
        "depth": traverse_depth,
        "start_nodes": start_labels,
        "node_count": len(nodes),
        "context": context,
    }


def run_path(
    G: nx.Graph,
    source: str,
    target: str,
    *,
    max_hops: int = 8,
) -> dict:
    src_scored = resolve_start_nodes(G, source)
    tgt_scored = resolve_start_nodes(G, target)
    if not src_scored:
        return {
            "status": "no_source",
            "reason": f"No node matching source '{source}' found.",
        }
    if not tgt_scored:
        return {
            "status": "no_target",
            "reason": f"No node matching target '{target}' found.",
        }
    src_nid, tgt_nid = src_scored[0][2], tgt_scored[0][2]
    src_label = G.nodes[src_nid].get("label", src_nid)
    tgt_label = G.nodes[tgt_nid].get("label", tgt_nid)

    # Same node — return explain-style info instead of zero-hop path
    if src_nid == tgt_nid:
        return {
            "status": "same_node",
            "source": src_label,
            "target": tgt_label,
            "hops": 0,
            "context": f"Same node: {src_label} — use --explain for full details.",
        }

    try:
        path_nodes = nx.shortest_path(G, src_nid, tgt_nid)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return {
            "status": "no_path",
            "source": src_label,
            "target": tgt_label,
            "reason": f"No path found between '{src_label}' and '{tgt_label}'.",
        }
    hops = len(path_nodes) - 1
    if hops > max_hops:
        return {
            "status": "too_long",
            "source": src_label,
            "target": tgt_label,
            "hops": hops,
            "max_hops": max_hops,
            "reason": f"Path exceeds max_hops={max_hops} ({hops} hops found).",
        }
    segments = []
    edge_details = []
    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edata = G.edges[u, v]
        rel = edata.get("relation", "")
        conf = edata.get("confidence", "")
        u_label = G.nodes[u].get("label", u)
        v_label = G.nodes[v].get("label", v)
        edge_details.append(
            {
                "from": u_label,
                "to": v_label,
                "relation": rel,
                "confidence": conf,
            }
        )
        conf_str = f" [{conf}]" if conf else ""
        if i == 0:
            segments.append(u_label)
        segments.append(f"--{rel}{conf_str}--> {v_label}")
    path_text = " ".join(segments)
    return {
        "status": "ok",
        "source": src_label,
        "target": tgt_label,
        "hops": hops,
        "path": path_text,
        "edges": edge_details,
        "context": f"Shortest path ({hops} hops):\n  {path_text}",
    }


def run_explain(G: nx.Graph, label: str) -> dict:
    matches = find_node(G, label)
    if not matches:
        return {
            "status": "no_match",
            "reason": f"No node matching '{label}' found.",
        }
    nid = matches[0]
    d = G.nodes[nid]
    neighbors = list(G.neighbors(nid))
    neighbor_rows = []
    for nb in sorted(neighbors, key=lambda n: G.degree(n), reverse=True)[:20]:
        edata = G.edges[nid, nb]
        neighbor_rows.append(
            {
                "label": G.nodes[nb].get("label", nb),
                "relation": edata.get("relation", ""),
                "confidence": edata.get("confidence", ""),
            }
        )
    lines = [
        f"Node: {d.get('label', nid)}",
        f"  ID:        {nid}",
        f"  Source:    {d.get('source_file', '')} {d.get('source_location', '')}".rstrip(),
        f"  Type:      {d.get('file_type', '')}",
        f"  Community: {d.get('community', '')}",
        f"  Degree:    {G.degree(nid)}",
    ]
    if neighbor_rows:
        lines.append(f"\nConnections ({len(neighbors)}):")
        for row in neighbor_rows:
            lines.append(
                f"  --> {row['label']} [{row['relation']}] [{row['confidence']}]"
            )
        if len(neighbors) > 20:
            lines.append(f"  ... and {len(neighbors) - 20} more")
    return {
        "status": "ok",
        "node": {
            "id": nid,
            "label": d.get("label", nid),
            "source_file": d.get("source_file", ""),
            "source_location": d.get("source_location", ""),
            "file_type": d.get("file_type", ""),
            "community": d.get("community", ""),
            "degree": G.degree(nid),
        },
        "neighbors": neighbor_rows,
        "neighbor_count": len(neighbors),
        "context": "\n".join(lines),
    }
