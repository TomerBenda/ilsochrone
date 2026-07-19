"""Filtered network -> simplified graph -> GraphArrays (see binfmt)."""
from __future__ import annotations

import networkx as nx
import numpy as np
from shapely.geometry import LineString

from .binfmt import GraphArrays
from .config import GEOMETRY_SIMPLIFY_DEG, SPEEDS_KMH


def _first(v):
    if isinstance(v, (list, tuple, np.ndarray)):
        return v[0] if len(v) else None
    return v


def _to_multidigraph(nodes, edges) -> nx.MultiDiGraph:
    G = nx.MultiDiGraph()
    G.graph["crs"] = "EPSG:4326"
    G.graph["simplified"] = False
    id_col = "id" if "id" in nodes.columns else "osmid"
    for nid, x, y in zip(nodes[id_col], nodes["lon"], nodes["lat"]):
        G.add_node(int(nid), x=float(x), y=float(y))
    for row in edges.itertuples(index=False):
        data = {
            "length": float(row.length),
            "highway": row.highway,
            "geometry": row.geometry,
            "osmid": int(getattr(row, "id", 0)),
        }
        G.add_edge(int(row.u), int(row.v), **data)
        G.add_edge(int(row.v), int(row.u), **data)
    return G


def _simplify(G: nx.MultiDiGraph) -> nx.MultiDiGraph:
    from osmnx.simplification import simplify_graph

    try:
        return simplify_graph(G, edge_attrs_differ=["highway"])
    except TypeError:  # older OSMnx kwarg name
        return simplify_graph(G, relevant_attributes=["highway"])


def _largest_component(G: nx.MultiDiGraph) -> nx.MultiDiGraph:
    und = G.to_undirected(as_view=True)
    biggest = max(nx.connected_components(und), key=lambda c: (len(c), min(c)))
    return G.subgraph(biggest).copy()


def _edge_time_cs(data: dict) -> tuple[float, int]:
    length = data.get("length", 0.0)
    if isinstance(length, (list, tuple)):
        length = sum(length)
    highway = _first(data.get("highway"))
    speed_kmh = SPEEDS_KMH["steps"] if highway == "steps" else SPEEDS_KMH["default"]
    return float(length), round(float(length) / (speed_kmh / 3.6) * 100)


def _edge_geometry(data: dict, ax: float, ay: float, bx: float, by: float) -> list[tuple[float, float]]:
    geom = data.get("geometry")
    if isinstance(geom, LineString):
        coords = list(geom.coords)
    else:
        coords = [(ax, ay), (bx, by)]
    # orient A -> B
    fx, fy = coords[0]
    if (fx - ax) ** 2 + (fy - ay) ** 2 > (fx - bx) ** 2 + (fy - by) ** 2:
        coords.reverse()
    if len(coords) > 2:
        coords = list(LineString(coords).simplify(GEOMETRY_SIMPLIFY_DEG, preserve_topology=False).coords)
    coords[0] = (ax, ay)
    coords[-1] = (bx, by)
    return coords


def build_graph_arrays(nodes, edges):
    G = _largest_component(_simplify(_to_multidigraph(nodes, edges)))

    node_ids = sorted(G.nodes)
    idx = {nid: i for i, nid in enumerate(node_ids)}
    node_lng = np.array([G.nodes[n]["x"] for n in node_ids])
    node_lat = np.array([G.nodes[n]["y"] for n in node_ids])

    seen: set = set()
    undirected = []  # (a_idx, b_idx, time_cs, coords)
    for u, v, data in G.edges(data=True):
        a, b = (u, v) if idx[u] <= idx[v] else (v, u)
        ax, ay = G.nodes[a]["x"], G.nodes[a]["y"]
        bx, by = G.nodes[b]["x"], G.nodes[b]["y"]
        coords = _edge_geometry(data, ax, ay, bx, by)
        sig = (idx[a], idx[b], tuple(round(c, 7) for xy in coords for c in xy))
        if sig in seen:
            continue
        seen.add(sig)
        _, time_cs = _edge_time_cs(data)
        undirected.append((idx[a], idx[b], time_cs, coords))

    undirected.sort(key=lambda e: (e[0], e[1], e[3]))

    geom_offsets = [0]
    geom_lng, geom_lat = [], []
    for _, _, _, coords in undirected:
        for x, y in coords:
            geom_lng.append(x)
            geom_lat.append(y)
        geom_offsets.append(len(geom_lng))

    adjacency: list[list[tuple[int, int, int]]] = [[] for _ in node_ids]
    for e, (a, b, time_cs, _) in enumerate(undirected):
        adjacency[a].append((b, time_cs, e << 1))
        adjacency[b].append((a, time_cs, e << 1 | 1))

    csr_offsets, csr_targets, csr_time_cs, csr_geom_ref = [0], [], [], []
    for entries in adjacency:
        for target, time_cs, ref in sorted(entries):
            csr_targets.append(target)
            csr_time_cs.append(time_cs)
            csr_geom_ref.append(ref)
        csr_offsets.append(len(csr_targets))

    arrays = GraphArrays(
        node_lng=node_lng,
        node_lat=node_lat,
        csr_offsets=np.array(csr_offsets, dtype=np.uint32),
        csr_targets=np.array(csr_targets, dtype=np.uint32),
        csr_time_cs=np.array(csr_time_cs, dtype=np.uint32),
        csr_geom_ref=np.array(csr_geom_ref, dtype=np.uint32),
        geom_offsets=np.array(geom_offsets, dtype=np.uint32),
        geom_lng=np.array(geom_lng),
        geom_lat=np.array(geom_lat),
    )
    stats = {
        "nodes": len(node_ids),
        "undirected_edges": len(undirected),
        "geometry_points": len(geom_lng),
    }
    return arrays, stats
