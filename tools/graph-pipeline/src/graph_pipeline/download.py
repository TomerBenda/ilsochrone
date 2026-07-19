"""Geofabrik download with local cache. Never runs in tests."""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .config import CACHE_DIR, GEOFABRIK_URL


def fetch_israel_pbf(refresh: bool = False) -> tuple[Path, str]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    pbf = CACHE_DIR / "israel-and-palestine-latest.osm.pbf"
    meta_file = CACHE_DIR / "israel.meta.json"
    if pbf.exists() and meta_file.exists() and not refresh:
        return pbf, json.loads(meta_file.read_text())["osmSnapshot"]

    print(f"downloading {GEOFABRIK_URL} ...")
    req = urllib.request.Request(GEOFABRIK_URL, headers={"User-Agent": "ilsochrone-graph-pipeline"})
    with urllib.request.urlopen(req) as resp, open(pbf, "wb") as f:
        last_modified = resp.headers.get("Last-Modified", "")
        while chunk := resp.read(1 << 20):
            f.write(chunk)
    try:
        snapshot = datetime.strptime(last_modified, "%a, %d %b %Y %H:%M:%S %Z").date().isoformat()
    except ValueError:
        snapshot = datetime.now(timezone.utc).date().isoformat()
    meta_file.write_text(json.dumps({"osmSnapshot": snapshot, "lastModified": last_modified}))
    print(f"cached {pbf} ({pbf.stat().st_size / 1e6:.1f} MB, snapshot {snapshot})")
    return pbf, snapshot
