"""OSM PBF -> filtered walkable network (nodes, edges frames).

The spec's first choice for extraction (pyrosm) is uninstallable on Windows —
its hard dependency cykhash ships source-only and needs MSVC — so this module
implements the spec's documented fallback: a hand-rolled pyosmium extractor
producing the same frame shapes pyrosm would have given us:

- nodes: DataFrame [id, lon, lat]  (only nodes used by kept edges)
- edges: GeoDataFrame [u, v, id, highway, foot, access, length, geometry]
  one row per consecutive way-node pair (chain merging happens later, in build)
"""
from __future__ import annotations

import math
from pathlib import Path

import geopandas as gpd
import osmium
import pandas as pd
from shapely.geometry import LineString

from .config import ALLOWED_HIGHWAY


def _haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class _WalkHandler(osmium.SimpleHandler):
    def __init__(self, bbox: tuple | None):
        super().__init__()
        self.bbox = bbox
        self.rows: list[dict] = []
        self.node_coords: dict[int, tuple[float, float]] = {}

    def _inside(self, lon: float, lat: float) -> bool:
        if self.bbox is None:
            return True
        min_lng, min_lat, max_lng, max_lat = self.bbox
        return min_lng <= lon <= max_lng and min_lat <= lat <= max_lat

    def way(self, w) -> None:
        highway = w.tags.get("highway")
        if highway not in ALLOWED_HIGHWAY:
            return
        foot = w.tags.get("foot")
        access = w.tags.get("access")
        if foot == "no":
            return
        if access in ("private", "no") and foot != "yes":
            return
        refs = [n for n in w.nodes if n.location.valid()]
        for a, b in zip(refs, refs[1:]):
            if a.ref == b.ref:
                continue
            alon, alat = a.location.lon, a.location.lat
            blon, blat = b.location.lon, b.location.lat
            # Clip: keep segments with BOTH endpoints inside the bbox. Edges
            # straddling the boundary are dropped — acceptable because the
            # clip bbox is deliberately more generous than the product area.
            if not (self._inside(alon, alat) and self._inside(blon, blat)):
                continue
            length = _haversine_m(alon, alat, blon, blat)
            if length <= 0:
                continue
            self.rows.append(
                {
                    "u": a.ref,
                    "v": b.ref,
                    "id": w.id,
                    "highway": highway,
                    "foot": foot,
                    "access": access,
                    "length": length,
                    "geometry": LineString([(alon, alat), (blon, blat)]),
                }
            )
            self.node_coords[a.ref] = (alon, alat)
            self.node_coords[b.ref] = (blon, blat)


def extract_walk_network(pbf_path: Path, bbox: tuple | None):
    handler = _WalkHandler(bbox)
    handler.apply_file(str(pbf_path), locations=True)
    if not handler.rows:
        raise ValueError(f"no walkable network found in {pbf_path} (bbox={bbox})")

    edges = gpd.GeoDataFrame(pd.DataFrame(handler.rows), geometry="geometry", crs="EPSG:4326")
    nodes = pd.DataFrame(
        [{"id": nid, "lon": lon, "lat": lat} for nid, (lon, lat) in sorted(handler.node_coords.items())]
    )
    return nodes, edges
