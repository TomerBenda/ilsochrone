"""Tunable constants for the walk-graph pipeline."""
from pathlib import Path

# tools/graph-pipeline/src/graph_pipeline/config.py -> repo root is 4 levels up.
REPO_ROOT = Path(__file__).resolve().parents[4]

PROFILE_ID = "walk-v1"

# Tel Aviv metro clip (Herzliya -> Bat Yam), lon/lat. Tunable.
BBOX = (34.74, 31.98, 34.92, 32.20)  # (min_lng, min_lat, max_lng, max_lat)

SPEEDS_KMH = {"default": 5.0, "steps": 3.0}

ALLOWED_HIGHWAY = {
    "footway", "path", "pedestrian", "steps", "living_street", "residential",
    "service", "track", "unclassified", "road", "cycleway",
    "tertiary", "tertiary_link", "secondary", "secondary_link",
    "primary", "primary_link",
}

GEOFABRIK_URL = "https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf"
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache"

# Douglas-Peucker tolerance for edge geometry, in degrees (~2 m).
GEOMETRY_SIMPLIFY_DEG = 2e-5

REAL_ASSET_OUT = REPO_ROOT / "apps" / "web" / "assets" / "graphs" / "walk-tlv.v1.bin"
FIXTURE_PBF = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "tiny.osm.pbf"
FIXTURE_ASSET_OUT = REPO_ROOT / "packages" / "engine" / "src" / "__fixtures__" / "tiny-walk.v1.bin"
