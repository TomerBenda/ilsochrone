"""build-graph entrypoint. See README.md."""
from __future__ import annotations

import argparse
from pathlib import Path

from . import binfmt, build, config, download, extract


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="build-graph")
    ap.add_argument("--fixture", action="store_true", help="build the tiny engine test asset")
    ap.add_argument("--pbf", type=Path, help="use a local PBF instead of downloading")
    ap.add_argument("--out", type=Path, help="override output path")
    ap.add_argument("--refresh", action="store_true", help="re-download the OSM extract")
    args = ap.parse_args(argv)

    if args.fixture:
        pbf, snapshot = config.FIXTURE_PBF, "2026-07-19-fixture"
        out, bbox = config.FIXTURE_ASSET_OUT, None
    elif args.pbf:
        pbf, snapshot = args.pbf, "local-file"
        out, bbox = config.REAL_ASSET_OUT, config.BBOX
    else:
        pbf, snapshot = download.fetch_israel_pbf(refresh=args.refresh)
        out, bbox = config.REAL_ASSET_OUT, config.BBOX
    if args.out:
        out = args.out

    print(f"extracting walk network from {pbf} (bbox={bbox}) ...")
    nodes, edges = extract.extract_walk_network(pbf, bbox)
    print(f"  raw: {len(nodes)} nodes, {len(edges)} edges")
    arrays, stats = build.build_graph_arrays(nodes, edges)
    meta = binfmt.write_asset(arrays, {"profile": config.PROFILE_ID, "osmSnapshot": snapshot}, out)
    size_mb = out.stat().st_size / 1e6
    print(
        f"wrote {out}\n  nodes={stats['nodes']} undirectedEdges={stats['undirected_edges']} "
        f"geometryPoints={stats['geometry_points']} size={size_mb:.2f} MB bbox={meta['bbox']}"
    )
    return 0
