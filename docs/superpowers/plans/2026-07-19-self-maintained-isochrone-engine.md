# Self-Maintained Isochrone Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hosted OpenRouteService isochrone dependency with a repo-owned engine: a Python build pipeline (OSM → binary walk graph) plus a pure-TypeScript runtime (snap → Dijkstra → marching-squares polygon), wired in as a `local` provider behind the unchanged `IsochroneProvider` contract.

**Architecture:** `tools/graph-pipeline` (Python, uv-managed, never deployed) converts the Geofabrik Israel extract into a versioned binary graph asset committed to the repo. `packages/engine` (pure TS, no Node APIs) parses that asset and computes isochrones. `packages/providers` gains `LocalIsochroneProvider` + `BundledGraphSource` (server-only subpath export), selected in the route handler via `ISOCHRONE_PROVIDER`. Spec: `docs/superpowers/specs/2026-07-18-self-maintained-isochrone-engine-design.md`.

**Tech Stack:** Python 3.12 (uv, pyrosm, osmnx, shapely, geopandas, numpy, pyosmium, pytest) · TypeScript (d3-contour, @turf/simplify, vitest) · existing pnpm/turbo monorepo.

## Global Constraints

- Zero monthly cost: no paid compute/storage/hosting anywhere; Vercel free tier.
- Walking only in this leap; cycling/transit are designed-for follow-ups (do not build).
- Coverage: Tel Aviv metro clip bbox `lon 34.74–34.92, lat 31.98–32.20` (tunable constant in pipeline config).
- The public `IsochroneProvider` interface, `IsochroneRequestSchema`, `IsochroneResult` shape, and the UI polygon contract DO NOT change. Metadata additions are optional fields only.
- `packages/engine` is pure TS: no `node:*` imports, graph arrives as `ArrayBuffer`. All I/O lives in `packages/providers` (server-only subpath) or `apps/web`.
- The graph asset is committed to the repo at `apps/web/assets/graphs/walk-tlv.v1.bin` so deploys are reproducible without running the pipeline.
- The client bundle must never import `node:fs`: `BundledGraphSource`/`LocalIsochroneProvider` are exported ONLY from the new `@ilsochrone/providers/server` subpath, never from the main barrel.
- TDD throughout; commit after every green test cycle. Branch: `feat/local-isochrone-engine` off `main`.
- Node >= 20.11, pnpm 9.12, TS strict + `noUncheckedIndexedAccess` (typed-array indexing returns `T | undefined` — use `!` where the index is provably in range).
- Dev machine is Windows; run repo commands through Git Bash (the Bash tool). Python via `uv` (pinned `requires-python >=3.12,<3.13`; uv auto-provisions the interpreter).
- Binary format v1 is the language-neutral contract; any change to it must update `docs/reference/graph-asset-format.md`, the Python writer, the TS reader, and the TS test-helper writer together, and regenerate committed fixture assets.
- Perf budget: 30-min isochrone on the real asset < 200 ms warm (< 1000 ms allowance when `process.env.CI` is set).

## Judgment calls made by this plan (spec gaps resolved)

These are decisions the spec left open or sketched; they are deliberate and recorded here so implementers don't re-litigate them:

1. **Coordinates are bbox-quantized Uint16** (≈0.3 m resolution at this bbox size), not Float64 — halves asset size; meta carries the exact bbox for dequantization.
2. **Edge times are Uint32 centiseconds** — no overflow ceiling to manage.
3. **Marching squares via `d3-contour`** (tiny, zero-dep, MIT) rather than turf isobands or a hand-rolled implementation; `@turf/simplify` for polygon simplification.
4. **Per-edge uniform speed** is guaranteed by passing `edge_attrs_differ=["highway"]` to OSMnx simplification (chains never merge across differing highway class), so walk-time seeding along a snapped edge can split time proportionally by distance.
5. **`OutOfCoverageError` does NOT trigger the ORS fallback** — the spec's error table maps it to HTTP 422 explicitly; `ISOCHRONE_FALLBACK=ors` covers only unexpected engine failures.
6. **Asset location** is `apps/web/assets/graphs/` (not inside packages) because the deployed lambda must trace it; `next.config.mjs` gets `experimental.outputFileTracingIncludes`. `BundledGraphSource` takes an explicit path with cwd-relative fallback candidates.
7. **Degraded-polygon flag** rides the existing `ProviderWarning[]` channel (`code: 'degraded_polygon'`), plus a new optional `metadata.engine` object (version, profile, graph build date, OSM snapshot) — additive, UI-safe (UI reads only `polygon`).
8. **ORS validation script** runs as a vitest-invoked script (raw `node script.ts` can't resolve the repo's extensionless relative imports); results land in `docs/research/02-local-vs-ors-iou.md` and ADR-0007.
9. **Largest connected component only** is kept in the graph (not in spec, but prevents snapping into disconnected slivers).
10. **Fixture counts:** pytest assertions on the tiny fixture pin exact node/edge counts; the first real run of the pipeline establishes them (library shape-node behavior varies) — verify the printed report against hand-derivation before pinning.

## File Structure (created/modified)

```
tools/graph-pipeline/                    NEW — Python, outside pnpm workspace
  pyproject.toml  README.md  .python-version
  src/graph_pipeline/{__init__,config,download,extract,build,binfmt,cli}.py
  tests/{conftest,test_binfmt,test_extract,test_build}.py
  tests/make_fixture.py                  (dev-only generator)
  tests/fixtures/tiny.osm.pbf            (committed, ~2 KB)
packages/engine/                         NEW — pure TS
  package.json  tsconfig.json  eslint.config.js  vitest.config.ts
  src/{index,types,errors,geo,graph,spatial,heap,search,polygonize,isochrone}.ts
  src/asset/{format,reader}.ts
  src/__tests__/helpers/build-asset.ts   (TS mirror of the Python writer, tests only)
  src/__tests__/*.test.ts
  src/__fixtures__/tiny-walk.v1.bin      (committed, built by Python pipeline)
packages/providers/
  src/server.ts                          NEW server-only subpath barrel
  src/isochrone/{local,bundled-source}.ts + tests
  src/types.ts                           (+ optional metadata.engine field)
  package.json                           (+ "./server" export, engine dep, turf devDeps)
  scripts/compare-ors.test.ts            (env-gated validation script)
apps/web/
  assets/graphs/walk-tlv.v1.bin          (committed real asset)
  src/lib/server/isochrone-providers.ts  NEW provider factory (+ test)
  src/app/api/isochrone/route.ts         (selection, 422, fallback)
  src/app/page.tsx                       (errorMessage: 422 branch)
  next.config.mjs  .env.example
docs/reference/graph-asset-format.md     NEW format contract
docs/adr/0007-self-maintained-isochrone-engine.md  NEW
docs/research/02-local-vs-ors-iou.md     NEW (validation results)
docs/{PRD.md,TASKS.md,DEVELOPING.md}     (updates)
turbo.json  .gitignore  .github/workflows/ci.yml  next.config.mjs
```

---

### Task 0: Branch

- [ ] **Step 0.1:** `cd C:/Users/tbd/Desktop/Projects/ilsochrone && git checkout -b feat/local-isochrone-engine`
  (`.aider.chat.history.md` is untracked noise — leave it alone, never commit it.)

---

### Task 1: Python pipeline scaffold + tiny OSM fixture

Proves the Python toolchain (uv + pyrosm on Windows) works before anything depends on it.

**Files:**
- Create: `tools/graph-pipeline/pyproject.toml`, `tools/graph-pipeline/.python-version`, `tools/graph-pipeline/README.md`, `tools/graph-pipeline/src/graph_pipeline/__init__.py`, `tools/graph-pipeline/src/graph_pipeline/config.py`, `tools/graph-pipeline/tests/conftest.py`, `tools/graph-pipeline/tests/make_fixture.py`, `tools/graph-pipeline/tests/fixtures/tiny.osm.pbf` (generated), `tools/graph-pipeline/tests/test_extract.py` (smoke part)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `config.BBOX`, `config.SPEEDS_KMH`, `config.ALLOWED_HIGHWAY`, `config.REPO_ROOT`, `config.PROFILE_ID = "walk-v1"`; committed fixture PBF with known layout (see below); `fixture_pbf` pytest fixture.

**Fixture layout (memorize — later tasks and TS tests depend on it):** base `B=(34.7800, 32.0800)`, spacing `D=0.0009°` (≈84.9 m in lng at 32.08°N, ≈100 m in lat).
- Grid: 3 rows × 4 cols of nodes, osmid `1 + r*4 + c` (r=0..2 rows going north, c=0..3 cols going east), at `(B.lng + c*D, B.lat + r*D)`.
- Ways: per row one `highway=residential` way (ids 101–103) over that row's 4 nodes; per col one `highway=footway` way (ids 201–204) over that col's 3 nodes.
- Way 301 `highway=steps`: nodes `[4, 13]`, node 13 at `(34.7800+3*D, 32.0800-D)` — hangs south off the east corner of row 0.
- Way 302 `highway=residential` dead-end chain: nodes `[8, 14, 15, 16]` at lats `32.0800+D`, lngs `B.lng+4*D, +5*D, +6*D` — nodes 14, 15 are degree-2 same-highway ⇒ must merge away in simplification.
- Way 303 `highway=motorway`: nodes `[17, 18]` (at `34.7800±D, 32.0780`) — must be excluded.
- Way 304 `highway=footway, foot=no`: nodes `[19, 20]` (at `34.7830/34.7839, 32.0770`) — excluded.
- Way 305 `highway=service, access=private`: nodes `[21, 22]` (at `34.7850/34.7859, 32.0770`) — excluded.
- Way 306 `highway=footway`: nodes `[23, 24]` at `(34.7872, 32.0872)/(34.7881, 32.0872)` — connected walkable island, must be pruned as non-largest component.

- [ ] **Step 1.1: Write configs and package skeleton**

`tools/graph-pipeline/pyproject.toml`:
```toml
[project]
name = "graph-pipeline"
version = "0.1.0"
description = "Build-time OSM -> walk-graph binary asset pipeline for ilsochrone."
requires-python = ">=3.12,<3.13"
dependencies = [
  "pyrosm>=0.6.2",
  "osmnx>=2.0",
  "networkx>=3.2",
  "shapely>=2.0",
  "geopandas>=1.0",
  "numpy>=1.26",
  "osmium>=3.7",
]

[project.scripts]
build-graph = "graph_pipeline.cli:main"

[dependency-groups]
dev = ["pytest>=8"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/graph_pipeline"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

`tools/graph-pipeline/.python-version`: `3.12`

`tools/graph-pipeline/src/graph_pipeline/__init__.py`: empty file.

`tools/graph-pipeline/src/graph_pipeline/config.py`:
```python
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
```

Append to root `.gitignore`:
```
# python pipeline
tools/graph-pipeline/.cache/
tools/graph-pipeline/.venv/
__pycache__/
*.pyc
.pytest_cache/
```

`tools/graph-pipeline/README.md`:
```markdown
# graph-pipeline

Build-time tool: converts an OSM extract into the versioned binary walk-graph
asset consumed by `packages/engine`. Never deployed. See
`docs/reference/graph-asset-format.md` for the binary contract.

## Usage

    uv run build-graph              # full build: download Israel extract (cached), emit apps/web/assets/graphs/walk-tlv.v1.bin
    uv run build-graph --fixture    # build the tiny test asset for packages/engine
    uv run pytest                   # pipeline tests (offline, run on the committed tiny fixture)

Regenerate the tiny OSM fixture (only when the layout changes):

    uv run python tests/make_fixture.py
```

- [ ] **Step 1.2: Write the fixture generator**

`tools/graph-pipeline/tests/make_fixture.py`:
```python
"""Writes tests/fixtures/tiny.osm.pbf — a deterministic few-block walk network.

Run manually when the layout changes: uv run python tests/make_fixture.py
Layout doc lives in the implementation plan and test comments; keep them in sync.
"""
from pathlib import Path

import osmium

OUT = Path(__file__).parent / "fixtures" / "tiny.osm.pbf"

B_LNG, B_LAT, D = 34.7800, 32.0800, 0.0009


def build() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    writer = osmium.SimpleWriter(str(OUT))

    def node(nid: int, lng: float, lat: float) -> None:
        writer.add_node(osmium.osm.mutable.Node(id=nid, location=(lng, lat)))

    def way(wid: int, refs: list[int], tags: dict[str, str]) -> None:
        writer.add_way(osmium.osm.mutable.Way(id=wid, nodes=refs, tags=list(tags.items())))

    # 3x4 grid, osmid = 1 + r*4 + c
    for r in range(3):
        for c in range(4):
            node(1 + r * 4 + c, B_LNG + c * D, B_LAT + r * D)
    node(13, B_LNG + 3 * D, B_LAT - D)        # steps endpoint
    node(14, B_LNG + 4 * D, B_LAT + D)        # dead-end chain (merge away)
    node(15, B_LNG + 5 * D, B_LAT + D)        # dead-end chain (merge away)
    node(16, B_LNG + 6 * D, B_LAT + D)        # dead-end endpoint
    node(17, B_LNG - D, 32.0780)              # motorway (excluded)
    node(18, B_LNG + D, 32.0780)
    node(19, 34.7830, 32.0770)                # foot=no (excluded)
    node(20, 34.7839, 32.0770)
    node(21, 34.7850, 32.0770)                # access=private (excluded)
    node(22, 34.7859, 32.0770)
    node(23, 34.7872, 32.0872)                # disconnected island (pruned)
    node(24, 34.7881, 32.0872)

    for r in range(3):                        # horizontal residential rows
        way(101 + r, [1 + r * 4 + c for c in range(4)], {"highway": "residential"})
    for c in range(4):                        # vertical footway cols
        way(201 + c, [1 + c, 5 + c, 9 + c], {"highway": "footway"})
    way(301, [4, 13], {"highway": "steps"})
    way(302, [8, 14, 15, 16], {"highway": "residential"})
    way(303, [17, 18], {"highway": "motorway"})
    way(304, [19, 20], {"highway": "footway", "foot": "no"})
    way(305, [21, 22], {"highway": "service", "access": "private"})
    way(306, [23, 24], {"highway": "footway"})

    writer.close()
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
```

`tools/graph-pipeline/tests/conftest.py`:
```python
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def fixture_pbf() -> Path:
    pbf = FIXTURES / "tiny.osm.pbf"
    assert pbf.exists(), "run: uv run python tests/make_fixture.py"
    return pbf
```

- [ ] **Step 1.3: Install and generate**

Run (in `tools/graph-pipeline/`): `uv sync` then `uv run python tests/make_fixture.py`
Expected: `.venv` created with Python 3.12.x; `tests/fixtures/tiny.osm.pbf` written (~1–3 KB).
If `pyrosm` fails to build/install on Windows: STOP and record the failure, then fall back to WSL-free plan B — pin `pyrosm==0.6.2` (has cp312 wheels) or, if no pyrosm version installs, replace the pyrosm extraction (Task 3) with a hand-rolled `osmium.SimpleHandler` extractor (collect ways whose `highway` ∈ ALLOWED, their node locations, then build the same GeoDataFrame shapes). Do not silently switch approaches — note it in the task report.
If `osmium.osm.mutable.Way(... tags=list(...))` errors on the installed pyosmium version, use `tags=dict(...)` — both shapes exist across versions; the test in Step 1.4 is the arbiter.

- [ ] **Step 1.4: Write the failing smoke test** (start of `tests/test_extract.py`)

```python
"""Extraction tests — run entirely offline on the committed tiny fixture."""
from pyrosm import OSM


def test_fixture_parses_with_pyrosm(fixture_pbf):
    osm = OSM(str(fixture_pbf))
    nodes, edges = osm.get_network(nodes=True, network_type="walking")
    assert nodes is not None and edges is not None
    # walking profile itself must at least see the grid; excludes motorway
    assert len(edges) >= 15
    assert "motorway" not in set(edges["highway"].explode())
```

- [ ] **Step 1.5:** Run `uv run pytest tests/test_extract.py -v` — expected PASS (this validates the whole toolchain; if pyrosm can't read the fixture, fix the fixture writer first — most likely cause is missing node locations or unsorted ids).

- [ ] **Step 1.6: Commit**
```bash
git add tools/graph-pipeline .gitignore
git commit -m "feat(pipeline): scaffold uv-managed graph pipeline with tiny OSM fixture"
```

---

### Task 2: Binary asset format — reference doc + Python writer

**Files:**
- Create: `docs/reference/graph-asset-format.md`, `tools/graph-pipeline/src/graph_pipeline/binfmt.py`, `tools/graph-pipeline/tests/test_binfmt.py`

**Interfaces:**
- Produces: `binfmt.GraphArrays` dataclass, `binfmt.write_asset(arrays, meta, out_path) -> dict` (returns the meta it embedded), `binfmt.read_asset(path)` (Python reader used only by tests), constants `MAGIC=b"ILSOWALK"`, `FORMAT_VERSION=1`. The byte layout below is THE contract — the TS reader (Task 6) and TS test writer must match it exactly.

**Binary format v1 (little-endian throughout):**
```
bytes 0..8    magic "ILSOWALK" (ASCII)
bytes 8..12   uint32 formatVersion = 1
bytes 12..16  uint32 metaByteLength M
bytes 16..16+M  meta JSON, UTF-8, compact separators
then, each section 8-byte aligned (zero padding before each section start):
  nodeX        uint16[nodes]              quantized lng
  nodeY        uint16[nodes]              quantized lat
  csrOffsets   uint32[nodes+1]
  csrTargets   uint32[directedEdges]
  csrTimeCs    uint32[directedEdges]      walk time, centiseconds
  csrGeomRef   uint32[directedEdges]      (undirectedEdgeIndex << 1) | reversedBit
  geomOffsets  uint32[undirectedEdges+1]  indices into geom point arrays
  geomX        uint16[geometryPoints]
  geomY        uint16[geometryPoints]
```
Quantization: `q = round((v - lo) / (hi - lo) * 65535)` clipped to [0, 65535], where `lo/hi` come from `meta.bbox = [minLng, minLat, maxLng, maxLat]` — the exact min/max over ALL node + geometry coordinates (padded by 1e-6° if degenerate). Undirected edge geometry runs from endpoint A to endpoint B inclusive (first/last points are the node positions, within quantization error); each undirected edge appears as exactly two directed CSR entries — the A→B entry has reversedBit 0, the B→A entry has reversedBit 1. Meta JSON keys: `formatVersion, profile, osmSnapshot, buildTimestamp, bbox, counts{nodes,directedEdges,undirectedEdges,geometryPoints}, speeds{defaultKmh,stepsKmh}`.

- [ ] **Step 2.1: Write the reference doc** `docs/reference/graph-asset-format.md` — transcribe the layout block above verbatim, plus: purpose (language-neutral contract, spec §5), the quantization formula with worked example, the CSR/geomRef relationship, and a "consumers/producers" list (Python writer `binfmt.py`, TS reader `packages/engine/src/asset/reader.ts`, TS test writer `build-asset.ts`).

- [ ] **Step 2.2: Write the failing round-trip test** `tools/graph-pipeline/tests/test_binfmt.py`:
```python
import json
import struct

import numpy as np

from graph_pipeline import binfmt


def _mini_arrays():
    # 3 nodes in a line, 2 undirected edges, straight-line geometry.
    return binfmt.GraphArrays(
        node_lng=np.array([34.78, 34.781, 34.782]),
        node_lat=np.array([32.08, 32.08, 32.08]),
        csr_offsets=np.array([0, 1, 3, 4], dtype=np.uint32),
        csr_targets=np.array([1, 0, 2, 1], dtype=np.uint32),
        csr_time_cs=np.array([6000, 6000, 7000, 7000], dtype=np.uint32),
        csr_geom_ref=np.array([0 << 1 | 0, 0 << 1 | 1, 1 << 1 | 0, 1 << 1 | 1], dtype=np.uint32),
        geom_offsets=np.array([0, 2, 4], dtype=np.uint32),
        geom_lng=np.array([34.78, 34.781, 34.781, 34.782]),
        geom_lat=np.array([32.08, 32.08, 32.08, 32.08]),
    )


def test_round_trip(tmp_path):
    out = tmp_path / "mini.bin"
    meta = binfmt.write_asset(_mini_arrays(), {"profile": "walk-v1", "osmSnapshot": "2026-07-19"}, out)
    raw = out.read_bytes()
    assert raw[:8] == b"ILSOWALK"
    version, meta_len = struct.unpack_from("<II", raw, 8)
    assert version == 1
    assert json.loads(raw[16:16 + meta_len]) == meta
    assert meta["counts"] == {"nodes": 3, "directedEdges": 4, "undirectedEdges": 2, "geometryPoints": 4}

    parsed = binfmt.read_asset(out)
    assert parsed.meta == meta
    np.testing.assert_allclose(parsed.node_lng, [34.78, 34.781, 34.782], atol=1e-5)
    np.testing.assert_allclose(parsed.node_lat, [32.08, 32.08, 32.08], atol=1e-5)
    np.testing.assert_array_equal(parsed.csr_offsets, [0, 1, 3, 4])
    np.testing.assert_array_equal(parsed.csr_time_cs, [6000, 6000, 7000, 7000])
    np.testing.assert_array_equal(parsed.geom_offsets, [0, 2, 4])
    np.testing.assert_allclose(parsed.geom_lng, [34.78, 34.781, 34.781, 34.782], atol=1e-5)


def test_sections_are_8_byte_aligned(tmp_path):
    out = tmp_path / "mini.bin"
    binfmt.write_asset(_mini_arrays(), {"profile": "walk-v1", "osmSnapshot": "x"}, out)
    offsets = binfmt.section_offsets(out.read_bytes())
    assert all(off % 8 == 0 for off in offsets.values())
```

- [ ] **Step 2.3:** Run `uv run pytest tests/test_binfmt.py -v` — expected FAIL (`binfmt` missing).

- [ ] **Step 2.4: Implement** `tools/graph-pipeline/src/graph_pipeline/binfmt.py`:
```python
"""Binary graph asset writer (+ test-only reader). Contract: docs/reference/graph-asset-format.md."""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .config import SPEEDS_KMH

MAGIC = b"ILSOWALK"
FORMAT_VERSION = 1
_Q = 65535


@dataclass
class GraphArrays:
    node_lng: np.ndarray   # float64 [N]
    node_lat: np.ndarray   # float64 [N]
    csr_offsets: np.ndarray  # uint32 [N+1]
    csr_targets: np.ndarray  # uint32 [D]
    csr_time_cs: np.ndarray  # uint32 [D]
    csr_geom_ref: np.ndarray  # uint32 [D]
    geom_offsets: np.ndarray  # uint32 [U+1]
    geom_lng: np.ndarray   # float64 [G]
    geom_lat: np.ndarray   # float64 [G]


@dataclass
class ParsedAsset:
    meta: dict
    node_lng: np.ndarray
    node_lat: np.ndarray
    csr_offsets: np.ndarray
    csr_targets: np.ndarray
    csr_time_cs: np.ndarray
    csr_geom_ref: np.ndarray
    geom_offsets: np.ndarray
    geom_lng: np.ndarray
    geom_lat: np.ndarray


def _quantize(v: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip(np.rint((v - lo) / (hi - lo) * _Q), 0, _Q).astype("<u2")


def _dequantize(q: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return lo + q.astype(np.float64) / _Q * (hi - lo)


def write_asset(arrays: GraphArrays, meta_extra: dict, out_path: Path) -> dict:
    all_lng = np.concatenate([arrays.node_lng, arrays.geom_lng])
    all_lat = np.concatenate([arrays.node_lat, arrays.geom_lat])
    min_lng, max_lng = float(all_lng.min()), float(all_lng.max())
    min_lat, max_lat = float(all_lat.min()), float(all_lat.max())
    if max_lng - min_lng < 1e-9:
        max_lng += 1e-6
    if max_lat - min_lat < 1e-9:
        max_lat += 1e-6

    meta = {
        "formatVersion": FORMAT_VERSION,
        "profile": meta_extra["profile"],
        "osmSnapshot": meta_extra["osmSnapshot"],
        "buildTimestamp": meta_extra.get(
            "buildTimestamp", datetime.now(timezone.utc).isoformat(timespec="seconds")
        ),
        "bbox": [min_lng, min_lat, max_lng, max_lat],
        "counts": {
            "nodes": int(len(arrays.node_lng)),
            "directedEdges": int(len(arrays.csr_targets)),
            "undirectedEdges": int(len(arrays.geom_offsets) - 1),
            "geometryPoints": int(len(arrays.geom_lng)),
        },
        "speeds": {"defaultKmh": SPEEDS_KMH["default"], "stepsKmh": SPEEDS_KMH["steps"]},
    }
    meta_bytes = json.dumps(meta, separators=(",", ":")).encode("utf-8")

    out = bytearray()
    out += MAGIC
    out += struct.pack("<II", FORMAT_VERSION, len(meta_bytes))
    out += meta_bytes

    def emit(arr: np.ndarray) -> None:
        while len(out) % 8:
            out += b"\x00"
        out += arr.tobytes()

    emit(_quantize(arrays.node_lng, min_lng, max_lng))
    emit(_quantize(arrays.node_lat, min_lat, max_lat))
    emit(arrays.csr_offsets.astype("<u4"))
    emit(arrays.csr_targets.astype("<u4"))
    emit(arrays.csr_time_cs.astype("<u4"))
    emit(arrays.csr_geom_ref.astype("<u4"))
    emit(arrays.geom_offsets.astype("<u4"))
    emit(_quantize(arrays.geom_lng, min_lng, max_lng))
    emit(_quantize(arrays.geom_lat, min_lat, max_lat))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(bytes(out))
    return meta


def section_offsets(raw: bytes) -> dict[str, int]:
    """Byte offset of each section start; shared by read_asset and the alignment test."""
    version, meta_len = struct.unpack_from("<II", raw, 8)
    assert raw[:8] == MAGIC, "bad magic"
    assert version == FORMAT_VERSION, f"unsupported version {version}"
    meta = json.loads(raw[16:16 + meta_len])
    n = meta["counts"]["nodes"]
    d = meta["counts"]["directedEdges"]
    u = meta["counts"]["undirectedEdges"]
    g = meta["counts"]["geometryPoints"]
    sizes = [
        ("nodeX", 2 * n), ("nodeY", 2 * n),
        ("csrOffsets", 4 * (n + 1)), ("csrTargets", 4 * d),
        ("csrTimeCs", 4 * d), ("csrGeomRef", 4 * d),
        ("geomOffsets", 4 * (u + 1)),
        ("geomX", 2 * g), ("geomY", 2 * g),
    ]
    offsets: dict[str, int] = {}
    pos = 16 + meta_len
    for name, size in sizes:
        pos = (pos + 7) // 8 * 8
        offsets[name] = pos
        pos += size
    assert pos <= len(raw), "asset truncated"
    return offsets


def read_asset(path: Path) -> ParsedAsset:
    raw = path.read_bytes()
    _, meta_len = struct.unpack_from("<II", raw, 8)
    meta = json.loads(raw[16:16 + meta_len])
    off = section_offsets(raw)
    c = meta["counts"]
    min_lng, min_lat, max_lng, max_lat = meta["bbox"][0], meta["bbox"][1], meta["bbox"][2], meta["bbox"][3]

    def u16(name: str, count: int) -> np.ndarray:
        return np.frombuffer(raw, dtype="<u2", count=count, offset=off[name])

    def u32(name: str, count: int) -> np.ndarray:
        return np.frombuffer(raw, dtype="<u4", count=count, offset=off[name])

    return ParsedAsset(
        meta=meta,
        node_lng=_dequantize(u16("nodeX", c["nodes"]), min_lng, max_lng),
        node_lat=_dequantize(u16("nodeY", c["nodes"]), min_lat, max_lat),
        csr_offsets=u32("csrOffsets", c["nodes"] + 1),
        csr_targets=u32("csrTargets", c["directedEdges"]),
        csr_time_cs=u32("csrTimeCs", c["directedEdges"]),
        csr_geom_ref=u32("csrGeomRef", c["directedEdges"]),
        geom_offsets=u32("geomOffsets", c["undirectedEdges"] + 1),
        geom_lng=_dequantize(u16("geomX", c["geometryPoints"]), min_lng, max_lng),
        geom_lat=_dequantize(u16("geomY", c["geometryPoints"]), min_lat, max_lat),
    )
```
Note `meta["bbox"]` unpacking is written index-wise on purpose — JSON gives a list.

- [ ] **Step 2.5:** Run `uv run pytest tests/test_binfmt.py -v` — expected PASS.

- [ ] **Step 2.6: Commit**
```bash
git add docs/reference/graph-asset-format.md tools/graph-pipeline
git commit -m "feat(pipeline): binary asset format v1 - reference doc, writer, round-trip tests"
```

---

### Task 3: Extraction & filtering (`extract.py`)

**Files:**
- Create: `tools/graph-pipeline/src/graph_pipeline/extract.py`
- Modify: `tools/graph-pipeline/tests/test_extract.py`

**Interfaces:**
- Consumes: `config.ALLOWED_HIGHWAY`, fixture PBF.
- Produces: `extract.extract_walk_network(pbf_path: Path, bbox: tuple | None) -> tuple[GeoDataFrame, GeoDataFrame]` returning `(nodes, edges)` where edges are filtered to the walkable profile and `highway`/`foot`/`access` columns are scalar (lists collapsed to first element).

- [ ] **Step 3.1: Add failing tests** to `tests/test_extract.py`:
```python
from graph_pipeline.extract import extract_walk_network


def test_filters_walkability(fixture_pbf):
    nodes, edges = extract_walk_network(fixture_pbf, bbox=None)
    highways = set(edges["highway"])
    assert "motorway" not in highways
    assert {"residential", "footway", "steps"} <= highways
    # foot=no footway (way 304) excluded: no edge touches osmids 19/20
    used = set(edges["u"]).union(edges["v"])
    assert not {19, 20} & used
    # access=private service (way 305) excluded
    assert not {21, 22} & used
    # island way 306 survives extraction (pruned later, in build)
    assert {23, 24} <= used


def test_bbox_clip(fixture_pbf):
    # bbox excluding everything east of col 1 keeps only a sliver
    nodes, edges = extract_walk_network(fixture_pbf, bbox=(34.7795, 32.0795, 34.7805, 32.0825))
    used = set(edges["u"]).union(edges["v"])
    assert used and used <= {1, 5, 9}
```

- [ ] **Step 3.2:** Run `uv run pytest tests/test_extract.py -v` — expected FAIL (no `extract` module).

- [ ] **Step 3.3: Implement** `extract.py`:
```python
"""OSM PBF -> filtered walkable network (nodes, edges GeoDataFrames)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from pyrosm import OSM

from .config import ALLOWED_HIGHWAY


def _first(v):
    if isinstance(v, (list, tuple, np.ndarray)):
        return v[0] if len(v) else None
    return v


def extract_walk_network(pbf_path: Path, bbox: tuple | None):
    box = list(bbox) if bbox else None
    osm = OSM(str(pbf_path), bounding_box=box)
    nodes, edges = osm.get_network(nodes=True, network_type="walking")
    if edges is None or len(edges) == 0:
        raise ValueError(f"no walking network found in {pbf_path}")

    edges = edges.copy()
    edges["highway"] = edges["highway"].map(_first)
    for col in ("foot", "access"):
        if col in edges.columns:
            edges[col] = edges[col].map(_first)
        else:
            edges[col] = None

    mask = edges["highway"].isin(ALLOWED_HIGHWAY)
    foot = edges["foot"].fillna("")
    access = edges["access"].fillna("")
    mask &= foot != "no"
    mask &= ~(access.isin(["private", "no"]) & (foot != "yes"))
    edges = edges[mask].reset_index(drop=True)

    used = set(edges["u"]).union(edges["v"])
    nodes = nodes[nodes["id"].isin(used)].reset_index(drop=True)
    return nodes, edges
```
If pyrosm's `nodes` frame names its id column differently (`osmid` vs `id`), adapt here once — the tests pin behavior, not column names.

- [ ] **Step 3.4:** Run `uv run pytest tests/test_extract.py -v` — expected PASS (adjust for actual pyrosm column names if needed; keep assertions as written).

- [ ] **Step 3.5: Commit** — `git add tools/graph-pipeline && git commit -m "feat(pipeline): walkable network extraction with tag filtering"`

---

### Task 4: Graph build — times, simplification, component prune (`build.py`)

**Files:**
- Create: `tools/graph-pipeline/src/graph_pipeline/build.py`, `tools/graph-pipeline/tests/test_build.py`

**Interfaces:**
- Consumes: `(nodes, edges)` from `extract_walk_network`; `binfmt.GraphArrays`.
- Produces: `build.build_graph_arrays(nodes, edges) -> tuple[GraphArrays, dict]` — second item is a stats dict `{nodes, undirected_edges, geometry_points}`. Node ordering: sorted by OSM id ascending (deterministic; the TS cross-language test relies on it). Undirected edges sorted by `(a, b, geometry-signature)`.

**Algorithm:**
1. `G = osm-style MultiDiGraph` via `pyrosm.OSM.to_graph`-equivalent: use `pyrosm` helper if available on the extracted frames, else build with `osmnx.convert`/`networkx` directly: nodes carry `x`(lng)/`y`(lat); edges carry `length` (meters, from pyrosm), `highway`, `geometry`. Set `G.graph["crs"] = "EPSG:4326"`.
2. `simplify_graph(G, edge_attrs_differ=["highway"])` from `osmnx.simplification` — merges degree-2 chains, never across differing highway class (keeps per-edge speed uniform). If the installed OSMnx 2.x signature differs, adapt the kwarg (older name: `relevant_attributes`); the merge test is the arbiter.
3. Drop all but the largest connected component of the undirected view.
4. Collapse to undirected edge list: canonical `(a, b) = sorted((u, v))`; dedupe by signature `(a, b, rounded geometry tuple, normalized direction)`; keep parallel edges with distinct geometry.
5. Per edge: `highway = _first(attr)`; `speed = SPEEDS_KMH["steps"] if highway == "steps" else SPEEDS_KMH["default"]`; `length` = summed meters (osmnx sums on merge — if the attr is a list, sum it); `time_cs = round(length / (speed / 3.6) * 100)`.
6. Geometry: edge `geometry` LineString (or straight line between endpoints if absent); orient A→B (reverse if first point is nearer B than A); `shapely` `.simplify(GEOMETRY_SIMPLIFY_DEG, preserve_topology=False)`; force exact endpoint coords to node positions.
7. Emit `GraphArrays` with CSR (per node, adjacency sorted by target id; each undirected edge contributes two directed entries with geomRef reversedBit as per format doc).

- [ ] **Step 4.1: Write failing tests** `tests/test_build.py`:
```python
import numpy as np

from graph_pipeline.build import build_graph_arrays
from graph_pipeline.extract import extract_walk_network


def _arrays(fixture_pbf):
    nodes, edges = extract_walk_network(fixture_pbf, bbox=None)
    return build_graph_arrays(nodes, edges)


def test_counts_and_pruning(fixture_pbf):
    arrays, stats = _arrays(fixture_pbf)
    # Kept: 12 grid nodes + steps endpoint (13) + dead-end endpoint (16) = 14.
    # Nodes 14, 15 merge away (degree-2, same highway); island 23/24 pruned.
    assert stats["nodes"] == 14
    # 9 horizontal segments + 8 vertical + 1 steps + 1 merged dead-end = 19.
    assert stats["undirected_edges"] == 19
    assert len(arrays.csr_targets) == 38  # 2 per undirected edge
    assert arrays.csr_offsets[-1] == 38


def test_dead_end_chain_merged_with_geometry(fixture_pbf):
    arrays, _ = _arrays(fixture_pbf)
    pts_per_edge = np.diff(arrays.geom_offsets)
    # the merged dead-end edge keeps its interior shape points: 4-point polyline
    assert pts_per_edge.max() == 4
    assert (pts_per_edge >= 2).all()


def test_steps_slower_than_residential(fixture_pbf):
    arrays, _ = _arrays(fixture_pbf)
    # steps edge (~100 m at 3 km/h -> ~120 s); grid vertical footway (~100 m at 5 km/h -> ~72 s)
    times_s = arrays.csr_time_cs / 100.0
    assert ((times_s > 110) & (times_s < 130)).any(), "no steps-speed edge found"
    assert ((times_s > 65) & (times_s < 80)).any(), "no default-speed ~100 m edge found"


def test_deterministic(fixture_pbf):
    a1, _ = _arrays(fixture_pbf)
    a2, _ = _arrays(fixture_pbf)
    np.testing.assert_array_equal(a1.csr_targets, a2.csr_targets)
    np.testing.assert_array_equal(a1.csr_time_cs, a2.csr_time_cs)
    np.testing.assert_allclose(a1.geom_lng, a2.geom_lng)
```

- [ ] **Step 4.2:** Run `uv run pytest tests/test_build.py -v` — expected FAIL.

- [ ] **Step 4.3: Implement** `build.py`:
```python
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
    id_col = "id" if "id" in nodes.columns else "osmid"
    for nid, x, y in zip(nodes[id_col], nodes["lon"], nodes["lat"]):
        G.add_node(int(nid), x=float(x), y=float(y))
    for row in edges.itertuples(index=False):
        data = {
            "length": float(row.length),
            "highway": row.highway,
            "geometry": row.geometry,
            "osmid": getattr(row, "id", 0),
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
```
Notes for the implementer: pyrosm node frames use `lon`/`lat` (fall back to `x`/`y` if absent). If `simplify_graph` refuses the hand-built graph (it may require `osmid` on edges or a `simplified` flag), set the missing attribute rather than abandoning OSMnx; only if it fundamentally can't consume the graph, write a manual degree-2 merge (merge nodes with exactly 2 same-highway neighbors, concatenating geometry and summing length) and note the deviation. The `sig` dedupe intentionally collapses the duplicate directed entries created in `_to_multidigraph`.

- [ ] **Step 4.4:** Run `uv run pytest tests/test_build.py -v` — expected PASS. If `test_counts_and_pruning` fails, print actual counts, hand-verify against the fixture layout (see Task 1), and fix the CODE unless the discrepancy is a documented library behavior (e.g., simplify also merged the grid corners because attrs matched) — in that case re-derive and pin the correct expected counts with a comment.

- [ ] **Step 4.5:** Run `uv run pytest -v` (all pipeline tests green). **Commit:** `git add tools/graph-pipeline && git commit -m "feat(pipeline): graph build - walk times, chain simplification, component pruning, CSR arrays"`

---

### Task 5: CLI + committed engine fixture asset + downloader

**Files:**
- Create: `tools/graph-pipeline/src/graph_pipeline/cli.py`, `tools/graph-pipeline/src/graph_pipeline/download.py`
- Create (generated + committed): `packages/engine/src/__fixtures__/tiny-walk.v1.bin`

**Interfaces:**
- Produces: `uv run build-graph [--fixture] [--pbf PATH] [--out PATH] [--refresh]`; `download.fetch_israel_pbf(refresh: bool) -> tuple[Path, str]` returning `(pbf_path, osm_snapshot_date)`.

- [ ] **Step 5.1: Implement** `download.py`:
```python
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
```

- [ ] **Step 5.2: Implement** `cli.py`:
```python
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
```

- [ ] **Step 5.3:** Run `uv run build-graph --fixture`. Expected: prints counts matching Task 4 (14 nodes / 19 edges) and writes `packages/engine/src/__fixtures__/tiny-walk.v1.bin` (a few KB).

- [ ] **Step 5.4: Commit**
```bash
git add tools/graph-pipeline packages/engine/src/__fixtures__/tiny-walk.v1.bin
git commit -m "feat(pipeline): build-graph CLI, Geofabrik downloader, committed engine fixture asset"
```

---

### Task 6: Engine scaffold + asset reader

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/eslint.config.js`, `packages/engine/vitest.config.ts`, `packages/engine/src/types.ts`, `packages/engine/src/errors.ts`, `packages/engine/src/asset/format.ts`, `packages/engine/src/asset/reader.ts`, `packages/engine/src/index.ts`, `packages/engine/src/__tests__/helpers/build-asset.ts`, `packages/engine/src/__tests__/reader.test.ts`

**Interfaces:**
- Produces (public API growing over Tasks 6–10; final barrel in Task 10):
  - `readAssetMeta(buffer: ArrayBuffer): GraphAssetMeta`, `parseAsset(buffer): ParsedAsset`
  - types `GraphAssetMeta`, `GraphSource`, `ProfileId = 'walk'`, `LngLat = [number, number]`
  - errors `AssetFormatError`, `OutOfCoverageError`
  - test helper `buildAsset(spec): ArrayBuffer` mirroring the Python writer (toy graphs for all engine tests).

- [ ] **Step 6.1: Scaffold configs** (mirroring `packages/providers` exactly):

`packages/engine/package.json`:
```json
{
  "name": "@ilsochrone/engine",
  "version": "0.1.0",
  "private": true,
  "description": "Pure-TypeScript isochrone engine: binary walk-graph parsing, snapping, Dijkstra with cutoff, marching-squares polygonization.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@turf/simplify": "^7.1.0",
    "d3-contour": "^4.0.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.12.0",
    "@turf/area": "^7.1.0",
    "@turf/difference": "^7.1.0",
    "@turf/helpers": "^7.1.0",
    "@types/d3-contour": "^3.0.6",
    "@types/geojson": "^7946.0.14",
    "@types/node": "^20.16.10",
    "eslint": "^9.12.0",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.8.1",
    "vitest": "^2.1.2"
  }
}
```
`packages/engine/tsconfig.json` — same as providers but includes the binary fixture dir in `exclude`-safe way:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true,
    "types": ["node", "geojson"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```
(`types: ["node"]` is for tests only — production sources must not import `node:*`; the lint rule below enforces it.)

`packages/engine/eslint.config.js` — copy of providers' config plus a purity guard:
```js
// Flat-config ESLint for the engine package.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The engine must stay environment-agnostic: no Node builtins outside tests.
    files: ['src/**/*.ts'],
    ignores: ['src/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*', 'fs', 'path', 'os'] }] }],
    },
  },
);
```
`packages/engine/vitest.config.ts` — identical content to providers':
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 6.2: Types and errors**

`packages/engine/src/types.ts`:
```ts
import type { Polygon, MultiPolygon } from 'geojson';

/** [lng, lat] in WGS-84, matching the providers package convention. */
export type LngLat = [number, number];

export type ProfileId = 'walk';

/** Travels with every graph asset; embedded as JSON in the binary header. */
export interface GraphAssetMeta {
  formatVersion: number;
  profile: string; // e.g. 'walk-v1'
  osmSnapshot: string;
  buildTimestamp: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  counts: {
    nodes: number;
    directedEdges: number;
    undirectedEdges: number;
    geometryPoints: number;
  };
  speeds: { defaultKmh: number; stepsKmh: number };
}

/** Where graph bytes come from — the engine never knows (spec §5). */
export interface GraphSource {
  readonly name: string; // 'bundled', 'remote', ...
  load(profile: ProfileId): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }>;
}

export interface IsochroneComputation {
  polygon: Polygon | MultiPolygon;
  /** True when the polygonizer fell back to a minimal buffer around the origin. */
  degraded: boolean;
  /** Meters from the requested origin to the snapped point on the network. */
  snapDistanceM: number;
}
```

`packages/engine/src/errors.ts`:
```ts
/** Origin is outside the covered region or too far from any walkable edge. */
export class OutOfCoverageError extends Error {
  constructor(message = 'Origin is outside the covered area.') {
    super(message);
    this.name = 'OutOfCoverageError';
  }
}

/** The graph asset bytes are unreadable or of an unsupported version. */
export class AssetFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetFormatError';
  }
}
```

`packages/engine/src/asset/format.ts`:
```ts
/** Binary contract constants — docs/reference/graph-asset-format.md. */
export const MAGIC = 'ILSOWALK';
export const FORMAT_VERSION = 1;
export const COORD_MAX = 65535;
export const HEADER_FIXED_BYTES = 16; // magic(8) + version(4) + metaLength(4)

export function align8(n: number): number {
  return Math.ceil(n / 8) * 8;
}
```

- [ ] **Step 6.3: Write the TS asset builder test helper** `packages/engine/src/__tests__/helpers/build-asset.ts` — the exact mirror of the Python writer, used by every engine unit test:
```ts
/**
 * Test-only binary asset writer mirroring tools/graph-pipeline binfmt.py.
 * Contract: docs/reference/graph-asset-format.md. Keep the three in sync.
 */
import { COORD_MAX, FORMAT_VERSION, MAGIC, align8 } from '../../asset/format';
import type { GraphAssetMeta, LngLat } from '../../types';

export interface EdgeSpec {
  a: number;
  b: number;
  timeS: number;
  /** Full polyline A->B incl. endpoints; defaults to straight line. */
  geometry?: LngLat[];
}

export interface AssetSpec {
  nodes: LngLat[];
  edges: EdgeSpec[];
  meta?: Partial<Pick<GraphAssetMeta, 'profile' | 'osmSnapshot' | 'buildTimestamp' | 'speeds'>>;
}

export function buildAsset(spec: AssetSpec): ArrayBuffer {
  const { nodes, edges } = spec;
  const geometries = edges.map((e) => {
    const geom = e.geometry ?? [nodes[e.a]!, nodes[e.b]!];
    if (geom.length < 2) throw new Error('edge geometry needs >= 2 points');
    return geom;
  });

  const allPts: LngLat[] = [...nodes, ...geometries.flat()];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of allPts) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  if (maxLng - minLng < 1e-9) maxLng += 1e-6;
  if (maxLat - minLat < 1e-9) maxLat += 1e-6;
  const qLng = (v: number) => Math.min(COORD_MAX, Math.max(0, Math.round(((v - minLng) / (maxLng - minLng)) * COORD_MAX)));
  const qLat = (v: number) => Math.min(COORD_MAX, Math.max(0, Math.round(((v - minLat) / (maxLat - minLat)) * COORD_MAX)));

  const geomOffsets = new Uint32Array(edges.length + 1);
  for (let e = 0; e < edges.length; e++) geomOffsets[e + 1] = geomOffsets[e]! + geometries[e]!.length;
  const gCount = geomOffsets[edges.length]!;
  const geomX = new Uint16Array(gCount);
  const geomY = new Uint16Array(gCount);
  let gi = 0;
  for (const geom of geometries) {
    for (const [lng, lat] of geom) { geomX[gi] = qLng(lng); geomY[gi] = qLat(lat); gi++; }
  }

  const adjacency: Array<Array<[number, number, number]>> = nodes.map(() => []);
  edges.forEach((e, i) => {
    const timeCs = Math.round(e.timeS * 100);
    adjacency[e.a]!.push([e.b, timeCs, (i << 1) | 0]);
    adjacency[e.b]!.push([e.a, timeCs, (i << 1) | 1]);
  });
  const dCount = edges.length * 2;
  const csrOffsets = new Uint32Array(nodes.length + 1);
  const csrTargets = new Uint32Array(dCount);
  const csrTimeCs = new Uint32Array(dCount);
  const csrGeomRef = new Uint32Array(dCount);
  let di = 0;
  adjacency.forEach((entries, n) => {
    entries.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
    for (const [target, timeCs, ref] of entries) {
      csrTargets[di] = target; csrTimeCs[di] = timeCs; csrGeomRef[di] = ref; di++;
    }
    csrOffsets[n + 1] = di;
  });

  const meta: GraphAssetMeta = {
    formatVersion: FORMAT_VERSION,
    profile: spec.meta?.profile ?? 'walk-v1',
    osmSnapshot: spec.meta?.osmSnapshot ?? 'test',
    buildTimestamp: spec.meta?.buildTimestamp ?? '2026-07-19T00:00:00+00:00',
    bbox: [minLng, minLat, maxLng, maxLat],
    counts: {
      nodes: nodes.length,
      directedEdges: dCount,
      undirectedEdges: edges.length,
      geometryPoints: gCount,
    },
    speeds: spec.meta?.speeds ?? { defaultKmh: 5, stepsKmh: 3 },
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));

  const nodeX = new Uint16Array(nodes.length);
  const nodeY = new Uint16Array(nodes.length);
  nodes.forEach(([lng, lat], i) => { nodeX[i] = qLng(lng); nodeY[i] = qLat(lat); });

  const sections: Array<Uint16Array | Uint32Array> = [
    nodeX, nodeY, csrOffsets, csrTargets, csrTimeCs, csrGeomRef, geomOffsets, geomX, geomY,
  ];
  let total = 16 + metaBytes.length;
  for (const s of sections) total = align8(total) + s.byteLength;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < 8; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint32(8, FORMAT_VERSION, true);
  view.setUint32(12, metaBytes.length, true);
  bytes.set(metaBytes, 16);
  let pos = 16 + metaBytes.length;
  for (const s of sections) {
    pos = align8(pos);
    bytes.set(new Uint8Array(s.buffer, s.byteOffset, s.byteLength), pos);
    pos += s.byteLength;
  }
  return buffer;
}
```

- [ ] **Step 6.4: Write the failing reader test** `packages/engine/src/__tests__/reader.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseAsset, readAssetMeta } from '../asset/reader';
import { AssetFormatError } from '../errors';
import { buildAsset } from './helpers/build-asset';

const LINE = buildAsset({
  nodes: [
    [34.78, 32.08],
    [34.781, 32.08],
    [34.782, 32.08],
  ],
  edges: [
    { a: 0, b: 1, timeS: 60 },
    { a: 1, b: 2, timeS: 70 },
  ],
});

describe('readAssetMeta', () => {
  it('reads header meta', () => {
    const meta = readAssetMeta(LINE);
    expect(meta.formatVersion).toBe(1);
    expect(meta.profile).toBe('walk-v1');
    expect(meta.counts).toEqual({ nodes: 3, directedEdges: 4, undirectedEdges: 2, geometryPoints: 4 });
  });

  it('rejects bad magic', () => {
    const bad = LINE.slice(0);
    new Uint8Array(bad)[0] = 88;
    expect(() => readAssetMeta(bad)).toThrow(AssetFormatError);
  });

  it('rejects future format versions', () => {
    const bad = LINE.slice(0);
    new DataView(bad).setUint32(8, 99, true);
    expect(() => readAssetMeta(bad)).toThrow(AssetFormatError);
  });
});

describe('parseAsset', () => {
  it('round-trips arrays and dequantizes coordinates to ~0.5 m', () => {
    const parsed = parseAsset(LINE);
    expect(Array.from(parsed.csrOffsets)).toEqual([0, 1, 3, 4]);
    expect(Array.from(parsed.csrTargets)).toEqual([1, 0, 2, 1]);
    expect(Array.from(parsed.csrTimeCs)).toEqual([6000, 6000, 7000, 7000]);
    expect(Array.from(parsed.geomOffsets)).toEqual([0, 2, 4]);
    expect(parsed.nodeLng[1]!).toBeCloseTo(34.781, 5);
    expect(parsed.nodeLat[0]!).toBeCloseTo(32.08, 5);
  });

  it('rejects truncated buffers', () => {
    expect(() => parseAsset(LINE.slice(0, LINE.byteLength - 16))).toThrow(AssetFormatError);
  });
});
```

- [ ] **Step 6.5:** `pnpm install` at repo root (links the new package), then run `pnpm --filter @ilsochrone/engine test` — expected FAIL (`reader` missing).

- [ ] **Step 6.6: Implement** `packages/engine/src/asset/reader.ts`:
```ts
/** Binary asset parser. Contract: docs/reference/graph-asset-format.md. */
import { AssetFormatError } from '../errors';
import type { GraphAssetMeta } from '../types';
import { COORD_MAX, FORMAT_VERSION, MAGIC, align8 } from './format';

export interface ParsedAsset {
  meta: GraphAssetMeta;
  /** Dequantized WGS-84 coordinates. */
  nodeLng: Float64Array;
  nodeLat: Float64Array;
  csrOffsets: Uint32Array;
  csrTargets: Uint32Array;
  csrTimeCs: Uint32Array;
  csrGeomRef: Uint32Array;
  geomOffsets: Uint32Array;
  geomLng: Float64Array;
  geomLat: Float64Array;
}

export function readAssetMeta(buffer: ArrayBuffer): GraphAssetMeta {
  if (buffer.byteLength < 16) throw new AssetFormatError('asset too small for header');
  const view = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new AssetFormatError(`bad magic "${magic}"`);
  const version = view.getUint32(8, true);
  if (version !== FORMAT_VERSION) {
    throw new AssetFormatError(`unsupported format version ${version} (engine supports ${FORMAT_VERSION})`);
  }
  const metaLen = view.getUint32(12, true);
  if (16 + metaLen > buffer.byteLength) throw new AssetFormatError('meta length exceeds buffer');
  const json = new TextDecoder().decode(new Uint8Array(buffer, 16, metaLen));
  try {
    return JSON.parse(json) as GraphAssetMeta;
  } catch {
    throw new AssetFormatError('meta JSON is unparseable');
  }
}

export function parseAsset(buffer: ArrayBuffer): ParsedAsset {
  const meta = readAssetMeta(buffer);
  const { nodes: n, directedEdges: d, undirectedEdges: u, geometryPoints: g } = meta.counts;
  const metaLen = new DataView(buffer).getUint32(12, true);

  let pos = 16 + metaLen;
  const takeU16 = (count: number): Uint16Array => {
    pos = align8(pos);
    if (pos + count * 2 > buffer.byteLength) throw new AssetFormatError('asset truncated');
    const arr = new Uint16Array(buffer, pos, count);
    pos += count * 2;
    return arr;
  };
  const takeU32 = (count: number): Uint32Array => {
    pos = align8(pos);
    if (pos + count * 4 > buffer.byteLength) throw new AssetFormatError('asset truncated');
    const arr = new Uint32Array(buffer, pos, count);
    pos += count * 4;
    return arr;
  };

  const [minLng, minLat, maxLng, maxLat] = meta.bbox;
  const deq = (q: Uint16Array, lo: number, hi: number): Float64Array => {
    const out = new Float64Array(q.length);
    const scale = (hi - lo) / COORD_MAX;
    for (let i = 0; i < q.length; i++) out[i] = lo + q[i]! * scale;
    return out;
  };

  const nodeX = takeU16(n);
  const nodeY = takeU16(n);
  const csrOffsets = takeU32(n + 1);
  const csrTargets = takeU32(d);
  const csrTimeCs = takeU32(d);
  const csrGeomRef = takeU32(d);
  const geomOffsets = takeU32(u + 1);
  const geomX = takeU16(g);
  const geomY = takeU16(g);

  return {
    meta,
    nodeLng: deq(nodeX, minLng, maxLng),
    nodeLat: deq(nodeY, minLat, maxLat),
    csrOffsets,
    csrTargets,
    csrTimeCs,
    csrGeomRef,
    geomOffsets,
    geomLng: deq(geomX, minLng, maxLng),
    geomLat: deq(geomY, minLat, maxLat),
  };
}
```
Temporary barrel `packages/engine/src/index.ts` (final form in Task 10):
```ts
export { readAssetMeta, parseAsset, type ParsedAsset } from './asset/reader';
export { AssetFormatError, OutOfCoverageError } from './errors';
export type { GraphAssetMeta, GraphSource, IsochroneComputation, LngLat, ProfileId } from './types';
```

- [ ] **Step 6.7:** Run `pnpm --filter @ilsochrone/engine test` → PASS; `pnpm --filter @ilsochrone/engine typecheck` and `lint` → clean. (Typed-array views require the section byte offset to be a multiple of the element size — the 8-byte alignment guarantees it.)

- [ ] **Step 6.8: Commit** — `git add packages/engine pnpm-lock.yaml && git commit -m "feat(engine): package scaffold, binary asset reader, TS test-asset writer"`

---

### Task 7: `loadGraph` — derived arrays, spatial index, snapping

**Files:**
- Create: `packages/engine/src/geo.ts`, `packages/engine/src/graph.ts`, `packages/engine/src/spatial.ts`, `packages/engine/src/search.ts` (snap half), `packages/engine/src/__tests__/snap.test.ts`

**Interfaces:**
- Consumes: `parseAsset` (Task 6).
- Produces:
  - `loadGraph(buffer: ArrayBuffer): WalkGraph` in `graph.ts`
  - `WalkGraph` = `{ meta, nodeCount, undirectedEdgeCount, nodeXm, nodeYm, csrOffsets, csrTargets, csrTimeCs, csrGeomRef, geomOffsets, geomXm, geomYm, edgeA, edgeB, edgeTimeCs, edgeLenM, edgeGeomStartDistM, spatial, toMeters(lng,lat):[x,y], toLngLat(x,y):[lng,lat] }` — all coordinates converted once at load into a local equirectangular meter frame anchored at `bbox` min corner.
  - `snapOrigin(graph, origin: LngLat, maxDistM = 250): SnapPoint | null` in `search.ts`, `SnapPoint = { edge: number; xm: number; ym: number; distM: number; distAlongM: number }` (`distAlongM` measured from endpoint A along the polyline).
  - `SNAP_MAX_M = 250` exported constant.

**Meter frame:** `kx = 111320 * cos(refLat)`, `ky = 111132`, `refLat = (minLat + maxLat) / 2` in radians for the cos; `x = (lng - minLng) * kx`, `y = (lat - minLat) * ky`. Adequate at metro scale.

- [ ] **Step 7.1: Write failing tests** `src/__tests__/snap.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { snapOrigin } from '../search';
import { buildAsset } from './helpers/build-asset';

// One horizontal edge ~200 m long at lat 32.08: [34.780->34.7821]
const GRAPH = loadGraph(
  buildAsset({
    nodes: [
      [34.78, 32.08],
      [34.7821, 32.08],
    ],
    edges: [{ a: 0, b: 1, timeS: 144 }],
  }),
);

describe('loadGraph derivations', () => {
  it('derives undirected edge endpoints and polyline length', () => {
    expect(GRAPH.nodeCount).toBe(2);
    expect(GRAPH.undirectedEdgeCount).toBe(1);
    expect(GRAPH.edgeA[0]).toBe(0);
    expect(GRAPH.edgeB[0]).toBe(1);
    // 0.0021 deg lng at 32.08N ~ 198 m
    expect(GRAPH.edgeLenM[0]!).toBeGreaterThan(180);
    expect(GRAPH.edgeLenM[0]!).toBeLessThan(215);
  });
});

describe('snapOrigin', () => {
  it('snaps a point ~30 m north of the edge midpoint onto the edge', () => {
    const snap = snapOrigin(GRAPH, [34.781, 32.0803]);
    expect(snap).not.toBeNull();
    expect(snap!.edge).toBe(0);
    expect(snap!.distM).toBeGreaterThan(20);
    expect(snap!.distM).toBeLessThan(45);
    // distance along from node A ~ 94 m (proportional position of lng 34.781)
    expect(snap!.distAlongM).toBeGreaterThan(75);
    expect(snap!.distAlongM).toBeLessThan(115);
  });

  it('snaps beyond an endpoint to the endpoint itself', () => {
    const snap = snapOrigin(GRAPH, [34.7795, 32.08]);
    expect(snap).not.toBeNull();
    expect(snap!.distAlongM).toBeLessThan(1);
  });

  it('returns null when nothing is within 250 m', () => {
    expect(snapOrigin(GRAPH, [34.79, 32.09])).toBeNull(); // ~1.4 km away
    expect(snapOrigin(GRAPH, [35.5, 33.0])).toBeNull(); // far outside bbox
  });
});
```

- [ ] **Step 7.2:** Run `pnpm --filter @ilsochrone/engine test snap` — expected FAIL.

- [ ] **Step 7.3: Implement.** `src/geo.ts`:
```ts
/** Local equirectangular meter frame — good to <0.5% error at metro scale. */
export interface MeterFrame {
  minLng: number;
  minLat: number;
  kx: number;
  ky: number;
}

export function makeFrame(bbox: [number, number, number, number]): MeterFrame {
  const [minLng, minLat, , maxLat] = bbox;
  const refLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  return { minLng, minLat, kx: 111320 * Math.cos(refLat), ky: 111132 };
}

export function toMeters(f: MeterFrame, lng: number, lat: number): [number, number] {
  return [(lng - f.minLng) * f.kx, (lat - f.minLat) * f.ky];
}

export function toLngLat(f: MeterFrame, x: number, y: number): [number, number] {
  return [f.minLng + x / f.kx, f.minLat + y / f.ky];
}

/** Squared distance from point P to segment AB, plus the projection parameter t in [0,1]. */
export function projectToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { t: number; x: number; y: number; dist2: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { t, x, y, dist2: (px - x) * (px - x) + (py - y) * (py - y) };
}
```
`src/spatial.ts`:
```ts
/** Uniform-grid spatial index over edge polylines, built once at load. */
export const CELL_M = 250;

export interface SpatialIndex {
  cols: number;
  rows: number;
  /** cell -> undirected edge ids overlapping it (by per-segment bbox). */
  cells: Map<number, number[]>;
  maxXm: number;
  maxYm: number;
}

export function buildSpatialIndex(
  edgeCount: number,
  geomOffsets: Uint32Array,
  geomXm: Float64Array,
  geomYm: Float64Array,
  maxXm: number,
  maxYm: number,
): SpatialIndex {
  const cols = Math.max(1, Math.ceil(maxXm / CELL_M));
  const rows = Math.max(1, Math.ceil(maxYm / CELL_M));
  const cells = new Map<number, number[]>();
  const clampCol = (c: number) => Math.min(cols - 1, Math.max(0, c));
  const clampRow = (r: number) => Math.min(rows - 1, Math.max(0, r));
  for (let e = 0; e < edgeCount; e++) {
    const start = geomOffsets[e]!;
    const end = geomOffsets[e + 1]!;
    for (let i = start; i + 1 < end; i++) {
      const c0 = clampCol(Math.floor(Math.min(geomXm[i]!, geomXm[i + 1]!) / CELL_M));
      const c1 = clampCol(Math.floor(Math.max(geomXm[i]!, geomXm[i + 1]!) / CELL_M));
      const r0 = clampRow(Math.floor(Math.min(geomYm[i]!, geomYm[i + 1]!) / CELL_M));
      const r1 = clampRow(Math.floor(Math.max(geomYm[i]!, geomYm[i + 1]!) / CELL_M));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * cols + c;
          const list = cells.get(key);
          if (list === undefined) cells.set(key, [e]);
          else if (list[list.length - 1] !== e) list.push(e);
        }
      }
    }
  }
  return { cols, rows, cells, maxXm, maxYm };
}

/** Edge ids in the cell containing (x, y) plus the 8 neighbors. */
export function candidateEdges(index: SpatialIndex, xm: number, ym: number): number[] {
  const col = Math.floor(xm / CELL_M);
  const row = Math.floor(ym / CELL_M);
  const out = new Set<number>();
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= index.rows) continue;
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || c >= index.cols) continue;
      const list = index.cells.get(r * index.cols + c);
      if (list) for (const e of list) out.add(e);
    }
  }
  return [...out];
}
```
`src/graph.ts`:
```ts
import { parseAsset } from './asset/reader';
import { makeFrame, toLngLat as frameToLngLat, toMeters as frameToMeters } from './geo';
import { buildSpatialIndex, type SpatialIndex } from './spatial';
import type { GraphAssetMeta } from './types';

export interface WalkGraph {
  meta: GraphAssetMeta;
  nodeCount: number;
  undirectedEdgeCount: number;
  nodeXm: Float64Array;
  nodeYm: Float64Array;
  csrOffsets: Uint32Array;
  csrTargets: Uint32Array;
  csrTimeCs: Uint32Array;
  csrGeomRef: Uint32Array;
  geomOffsets: Uint32Array;
  geomXm: Float64Array;
  geomYm: Float64Array;
  edgeA: Uint32Array;
  edgeB: Uint32Array;
  edgeTimeCs: Uint32Array;
  edgeLenM: Float64Array;
  spatial: SpatialIndex;
  toMeters(lng: number, lat: number): [number, number];
  toLngLat(xm: number, ym: number): [number, number];
}

/** Parse + index a graph asset. Called once per process; the result is cached by callers. */
export function loadGraph(buffer: ArrayBuffer): WalkGraph {
  const p = parseAsset(buffer);
  const frame = makeFrame(p.meta.bbox);
  const n = p.meta.counts.nodes;
  const u = p.meta.counts.undirectedEdges;
  const g = p.meta.counts.geometryPoints;

  const nodeXm = new Float64Array(n);
  const nodeYm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = frameToMeters(frame, p.nodeLng[i]!, p.nodeLat[i]!);
    nodeXm[i] = x;
    nodeYm[i] = y;
  }
  const geomXm = new Float64Array(g);
  const geomYm = new Float64Array(g);
  for (let i = 0; i < g; i++) {
    const [x, y] = frameToMeters(frame, p.geomLng[i]!, p.geomLat[i]!);
    geomXm[i] = x;
    geomYm[i] = y;
  }

  // Derive per-undirected-edge endpoints/times from the forward CSR entries.
  const edgeA = new Uint32Array(u);
  const edgeB = new Uint32Array(u);
  const edgeTimeCs = new Uint32Array(u);
  for (let node = 0; node < n; node++) {
    const end = p.csrOffsets[node + 1]!;
    for (let k = p.csrOffsets[node]!; k < end; k++) {
      const ref = p.csrGeomRef[k]!;
      if ((ref & 1) === 0) {
        const e = ref >>> 1;
        edgeA[e] = node;
        edgeB[e] = p.csrTargets[k]!;
        edgeTimeCs[e] = p.csrTimeCs[k]!;
      }
    }
  }

  const edgeLenM = new Float64Array(u);
  for (let e = 0; e < u; e++) {
    let len = 0;
    const end = p.geomOffsets[e + 1]!;
    for (let i = p.geomOffsets[e]!; i + 1 < end; i++) {
      len += Math.hypot(geomXm[i + 1]! - geomXm[i]!, geomYm[i + 1]! - geomYm[i]!);
    }
    edgeLenM[e] = len;
  }

  const [maxXm, maxYm] = frameToMeters(frame, p.meta.bbox[2], p.meta.bbox[3]);
  const spatial = buildSpatialIndex(u, p.geomOffsets, geomXm, geomYm, maxXm, maxYm);

  return {
    meta: p.meta,
    nodeCount: n,
    undirectedEdgeCount: u,
    nodeXm,
    nodeYm,
    csrOffsets: p.csrOffsets,
    csrTargets: p.csrTargets,
    csrTimeCs: p.csrTimeCs,
    csrGeomRef: p.csrGeomRef,
    geomOffsets: p.geomOffsets,
    geomXm,
    geomYm,
    edgeA,
    edgeB,
    edgeTimeCs,
    edgeLenM,
    spatial,
    toMeters: (lng, lat) => frameToMeters(frame, lng, lat),
    toLngLat: (xm, ym) => frameToLngLat(frame, xm, ym),
  };
}
```
`src/search.ts` (snap half — Dijkstra added in Task 8):
```ts
import { projectToSegment } from './geo';
import { candidateEdges } from './spatial';
import type { WalkGraph } from './graph';
import type { LngLat } from './types';

export const SNAP_MAX_M = 250;

export interface SnapPoint {
  edge: number;
  xm: number;
  ym: number;
  /** Distance from the requested origin to the snapped point. */
  distM: number;
  /** Distance along the edge polyline from endpoint A to the snapped point. */
  distAlongM: number;
}

export function snapOrigin(graph: WalkGraph, origin: LngLat, maxDistM = SNAP_MAX_M): SnapPoint | null {
  const [px, py] = graph.toMeters(origin[0], origin[1]);
  // Quick reject: far outside the data frame.
  if (px < -maxDistM || py < -maxDistM || px > graph.spatial.maxXm + maxDistM || py > graph.spatial.maxYm + maxDistM) {
    return null;
  }
  let best: SnapPoint | null = null;
  let bestDist2 = maxDistM * maxDistM;
  for (const e of candidateEdges(graph.spatial, px, py)) {
    const start = graph.geomOffsets[e]!;
    const end = graph.geomOffsets[e + 1]!;
    let along = 0;
    for (let i = start; i + 1 < end; i++) {
      const ax = graph.geomXm[i]!;
      const ay = graph.geomYm[i]!;
      const bx = graph.geomXm[i + 1]!;
      const by = graph.geomYm[i + 1]!;
      const segLen = Math.hypot(bx - ax, by - ay);
      const proj = projectToSegment(px, py, ax, ay, bx, by);
      if (proj.dist2 <= bestDist2) {
        bestDist2 = proj.dist2;
        best = {
          edge: e,
          xm: proj.x,
          ym: proj.y,
          distM: Math.sqrt(proj.dist2),
          distAlongM: along + proj.t * segLen,
        };
      }
      along += segLen;
    }
  }
  return best;
}
```
Note `<=` in the `dist2` comparison: with several equidistant candidates the LAST examined wins deterministically (candidate order is itself deterministic).

- [ ] **Step 7.4:** Run `pnpm --filter @ilsochrone/engine test` — expected PASS (reader + snap suites).

- [ ] **Step 7.5: Commit** — `git add packages/engine && git commit -m "feat(engine): loadGraph with meter frame, grid spatial index, edge snapping"`

---

### Task 8: Min-heap + Dijkstra with cutoff

**Files:**
- Create: `packages/engine/src/heap.ts`, `packages/engine/src/__tests__/search.test.ts`
- Modify: `packages/engine/src/search.ts`

**Interfaces:**
- Produces: `shortestTimes(graph: WalkGraph, snap: SnapPoint, cutoffSec: number): Float64Array` — per-node arrival seconds, `Infinity` when unreached within cutoff; seeds BOTH endpoints of the snapped edge with time proportional to distance along the polyline. `MinHeap` with `push(time, id)`, `pop(): {time, id} | null`, `size`.

- [ ] **Step 8.1: Write failing tests** `src/__tests__/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { MinHeap } from '../heap';
import { snapOrigin, shortestTimes } from '../search';
import { buildAsset } from './helpers/build-asset';

describe('MinHeap', () => {
  it('pops in ascending time order', () => {
    const h = new MinHeap();
    [5, 1, 4, 1.5, 9, 0.5].forEach((t, i) => h.push(t, i));
    const out: number[] = [];
    for (let x = h.pop(); x !== null; x = h.pop()) out.push(x.time);
    expect(out).toEqual([0.5, 1, 1.5, 4, 5, 9]);
  });
});

// Square with a shortcut: 4 corners ~200 m apart; diagonal edge 0-2 is SLOW.
//   3 --- 2
//   |   / |
//   0 --- 1        edges: 0-1:144s, 1-2:144s, 2-3:144s, 3-0:144s, 0-2:600s
const SQUARE = loadGraph(
  buildAsset({
    nodes: [
      [34.78, 32.08],
      [34.7821, 32.08],
      [34.7821, 32.0818],
      [34.78, 32.0818],
    ],
    edges: [
      { a: 0, b: 1, timeS: 144 },
      { a: 1, b: 2, timeS: 144 },
      { a: 2, b: 3, timeS: 144 },
      { a: 3, b: 0, timeS: 144 },
      { a: 0, b: 2, timeS: 600 },
    ],
  }),
);

describe('shortestTimes', () => {
  it('finds known shortest paths, ignoring the slow shortcut', () => {
    const snap = snapOrigin(SQUARE, [34.78, 32.08])!; // exactly node 0
    const times = shortestTimes(SQUARE, snap, 1800);
    expect(times[0]!).toBeLessThan(1);
    expect(times[1]!).toBeCloseTo(144, 0);
    expect(times[3]!).toBeCloseTo(144, 0);
    expect(times[2]!).toBeCloseTo(288, 0); // via 1 or 3, not the 600 s diagonal
  });

  it('respects the cutoff', () => {
    const snap = snapOrigin(SQUARE, [34.78, 32.08])!;
    const times = shortestTimes(SQUARE, snap, 150);
    expect(times[1]!).toBeCloseTo(144, 0);
    expect(times[2]!).toBe(Infinity);
  });

  it('seeds both endpoints proportionally from a mid-edge snap', () => {
    // snap near middle of edge 0-1 (~99 m from node 0 -> ~72 s each way)
    const snap = snapOrigin(SQUARE, [34.78105, 32.0801])!;
    expect(snap.edge).toBe(0);
    const times = shortestTimes(SQUARE, snap, 1800);
    expect(times[0]!).toBeGreaterThan(50);
    expect(times[0]!).toBeLessThan(95);
    expect(times[1]!).toBeGreaterThan(50);
    expect(times[1]!).toBeLessThan(95);
    expect(Math.abs(times[0]! + times[1]! - 144)).toBeLessThan(2);
  });
});
```

- [ ] **Step 8.2:** Run — expected FAIL (`heap` / `shortestTimes` missing).

- [ ] **Step 8.3: Implement.** `src/heap.ts`:
```ts
/** Typed-array-backed binary min-heap keyed on float time with uint32 payload. */
export class MinHeap {
  private times: Float64Array;
  private ids: Uint32Array;
  private n = 0;

  constructor(capacity = 1024) {
    this.times = new Float64Array(capacity);
    this.ids = new Uint32Array(capacity);
  }

  get size(): number {
    return this.n;
  }

  push(time: number, id: number): void {
    if (this.n === this.times.length) this.grow();
    let i = this.n++;
    this.times[i] = time;
    this.ids[i] = id;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.times[parent]! <= this.times[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { time: number; id: number } | null {
    if (this.n === 0) return null;
    const top = { time: this.times[0]!, id: this.ids[0]! };
    this.n--;
    if (this.n > 0) {
      this.times[0] = this.times[this.n]!;
      this.ids[0] = this.ids[this.n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.n && this.times[l]! < this.times[smallest]!) smallest = l;
        if (r < this.n && this.times[r]! < this.times[smallest]!) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(i: number, j: number): void {
    const t = this.times[i]!;
    this.times[i] = this.times[j]!;
    this.times[j] = t;
    const d = this.ids[i]!;
    this.ids[i] = this.ids[j]!;
    this.ids[j] = d;
  }

  private grow(): void {
    const times = new Float64Array(this.times.length * 2);
    times.set(this.times);
    this.times = times;
    const ids = new Uint32Array(this.ids.length * 2);
    ids.set(this.ids);
    this.ids = ids;
  }
}
```
Append to `src/search.ts`:
```ts
import { MinHeap } from './heap';

/**
 * Dijkstra from the snapped point over walk-time weights, bounded by cutoffSec.
 * Returns per-node arrival seconds (Infinity = unreached within cutoff).
 */
export function shortestTimes(graph: WalkGraph, snap: SnapPoint, cutoffSec: number): Float64Array {
  const times = new Float64Array(graph.nodeCount).fill(Infinity);
  const heap = new MinHeap();

  const e = snap.edge;
  const edgeTimeS = graph.edgeTimeCs[e]! / 100;
  const len = graph.edgeLenM[e]!;
  const frac = len > 0 ? snap.distAlongM / len : 0;
  const seed = (node: number, t: number): void => {
    if (t <= cutoffSec && t < times[node]!) {
      times[node] = t;
      heap.push(t, node);
    }
  };
  seed(graph.edgeA[e]!, edgeTimeS * frac);
  seed(graph.edgeB[e]!, edgeTimeS * (1 - frac));

  for (let top = heap.pop(); top !== null; top = heap.pop()) {
    if (top.time > times[top.id]!) continue; // stale entry
    const end = graph.csrOffsets[top.id + 1]!;
    for (let k = graph.csrOffsets[top.id]!; k < end; k++) {
      const v = graph.csrTargets[k]!;
      const nt = top.time + graph.csrTimeCs[k]! / 100;
      if (nt <= cutoffSec && nt < times[v]!) {
        times[v] = nt;
        heap.push(nt, v);
      }
    }
  }
  return times;
}
```
(Move the `import { MinHeap } ...` up with the other imports; shown separately here for clarity of the diff.)

- [ ] **Step 8.4:** Run `pnpm --filter @ilsochrone/engine test` — PASS. **Commit:** `git add packages/engine && git commit -m "feat(engine): binary min-heap and cutoff Dijkstra with proportional edge seeding"`

---

### Task 9: Polygonizer — rasterize + marching squares + fallback

**Files:**
- Create: `packages/engine/src/polygonize.ts`, `packages/engine/src/__tests__/polygonize.test.ts`

**Interfaces:**
- Consumes: `WalkGraph`, `Float64Array` node times, `SnapPoint`, cutoff seconds.
- Produces: `polygonize(graph, times, snap, cutoffSec): { polygon: Polygon | MultiPolygon; degraded: boolean }`. Constants: `GRID_CELL_M = 60`, `OFFROAD_BUFFER_M = 100`, `OFFROAD_MPS = 5 / 3.6` (≈1.389), `SAMPLE_STEP_M = 45`.

**Algorithm (Valhalla-style, spec §6.3):**
1. Collect time-stamped samples: the snap point at t=0; then for every undirected edge with at least one endpoint reached (`min(ta, tb) < cutoff` or it is the snap edge), walk its polyline emitting samples at every vertex and every `SAMPLE_STEP_M` in between; sample time `t = min(ta + d/v, tb + (L-d)/v)` with `v = L / T_edge` (guard `L=0 || T=0` → `t = min(ta, tb)`); on the snap edge additionally `t = min(t, |d - snap.distAlongM| / v)`. Keep samples with `t <= cutoff`.
2. Raster grid of point samples: bounds = sample bbox padded by `OFFROAD_BUFFER_M + GRID_CELL_M`; store `g = cutoff - t` (unfilled: −1). Splat each sample into cells within radius `R = min((cutoff − t) * OFFROAD_MPS, OFFROAD_BUFFER_M)`: candidate `g' = cutoff − (t + distToCell / OFFROAD_MPS)`, keep the max.
3. `contours().size([w, h]).thresholds([0])` from d3-contour → MultiPolygon in grid index space; affine-transform to meters (`x = minX + (cx − 0.5) * GRID_CELL_M` — the lone-sample centering test below is the authority on the ±0.5; if it fails by ~half a cell, adjust the offset, rerun, and leave a comment), then to lng/lat.
4. Drop degenerate rings (<4 points) and specks (outer-ring shoelace area < `1.5 * GRID_CELL_M²`); `simplify(poly, { tolerance: 0.00005, highQuality: false, mutate: true })` from @turf/simplify.
5. Empty result → degraded fallback: 32-gon circle around the snap point, radius `max(40, min(cutoffSec * OFFROAD_MPS, OFFROAD_BUFFER_M))`, `degraded: true`. One polygon → `Polygon`; several → `MultiPolygon`.

- [ ] **Step 9.1: Write failing tests** `src/__tests__/polygonize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'; // add to engine devDeps if not already
import { point } from '@turf/helpers';
import { loadGraph } from '../graph';
import { polygonize } from '../polygonize';
import { snapOrigin, shortestTimes } from '../search';
import { buildAsset } from './helpers/build-asset';

const LINE = loadGraph(
  buildAsset({
    nodes: [
      [34.78, 32.08],
      [34.7842, 32.08], // ~396 m east
    ],
    edges: [{ a: 0, b: 1, timeS: 285 }], // ~5 km/h
  }),
);

function isoOn(graph: ReturnType<typeof loadGraph>, origin: [number, number], cutoffSec: number) {
  const snap = snapOrigin(graph, origin)!;
  const times = shortestTimes(graph, snap, cutoffSec);
  return { snap, result: polygonize(graph, times, snap, cutoffSec) };
}

describe('polygonize', () => {
  it('contains the origin and is not degraded on a healthy graph', () => {
    const { result } = isoOn(LINE, [34.781, 32.08], 120);
    expect(result.degraded).toBe(false);
    expect(booleanPointInPolygon(point([34.781, 32.08]), { type: 'Feature', properties: {}, geometry: result.polygon })).toBe(true);
  });

  it('extends along the reachable edge but stops near the time frontier', () => {
    // From node 0 with 120 s budget: reach ~167 m along the edge (+100 m offroad buffer).
    const { result } = isoOn(LINE, [34.78, 32.08], 120);
    const geom = result.polygon;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
    const lngs = rings.flat().map((c) => c[0]!);
    const maxLng = Math.max(...lngs);
    // frontier at ~34.78 + 167m/94.3m-per-0.001deg ≈ 34.7818; +buffer/cell slack < 34.7842
    expect(maxLng).toBeGreaterThan(34.7810);
    expect(maxLng).toBeLessThan(34.7835);
    // and it must NOT cover the far, unreachable end
    expect(booleanPointInPolygon(point([34.7842, 32.08]), { type: 'Feature', properties: {}, geometry: geom })).toBe(false);
  });

  it('centers on a lone origin sample (grid transform calibration)', () => {
    // 1 s budget: only the snap-point sample fills cells -> small blob centered on it
    const { result } = isoOn(LINE, [34.781, 32.08], 1);
    const geom = result.polygon;
    const coords = (geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat()).flat();
    const cLng = coords.reduce((s, c) => s + c[0]!, 0) / coords.length;
    const cLat = coords.reduce((s, c) => s + c[1]!, 0) / coords.length;
    // centroid within ~half a grid cell (60 m -> ~0.0007 deg) of the snapped point
    expect(Math.abs(cLng - 34.781)).toBeLessThan(0.0007);
    expect(Math.abs(cLat - 32.08)).toBeLessThan(0.0007);
  });

  it('is deterministic', () => {
    const a = isoOn(LINE, [34.781, 32.08], 120).result;
    const b = isoOn(LINE, [34.781, 32.08], 120).result;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
```
Add `@turf/boolean-point-in-polygon: ^7.1.0` to engine devDependencies (test-only).

- [ ] **Step 9.2:** Run — expected FAIL. Then implement `src/polygonize.ts`:
```ts
import { contours } from 'd3-contour';
import simplify from '@turf/simplify';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { WalkGraph } from './graph';
import type { SnapPoint } from './search';

export const GRID_CELL_M = 60;
export const OFFROAD_BUFFER_M = 100;
export const OFFROAD_MPS = 5 / 3.6;
export const SAMPLE_STEP_M = 45;
const SIMPLIFY_TOLERANCE_DEG = 0.00005;

export interface PolygonizeResult {
  polygon: Polygon | MultiPolygon;
  degraded: boolean;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

export function polygonize(
  graph: WalkGraph,
  times: Float64Array,
  snap: SnapPoint,
  cutoffSec: number,
): PolygonizeResult {
  const samples = collectSamples(graph, times, snap, cutoffSec);
  const rings = samples.length > 0 ? contourRings(samples, cutoffSec, graph) : [];
  const polygons = rings.filter((poly) => poly.length > 0);
  if (polygons.length === 0) {
    return { polygon: fallbackCircle(graph, snap, cutoffSec), degraded: true };
  }
  const geometry: Polygon | MultiPolygon =
    polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0]! }
      : { type: 'MultiPolygon', coordinates: polygons };
  simplify(geometry, { tolerance: SIMPLIFY_TOLERANCE_DEG, highQuality: false, mutate: true });
  return { polygon: geometry, degraded: false };
}

function collectSamples(
  graph: WalkGraph,
  times: Float64Array,
  snap: SnapPoint,
  cutoffSec: number,
): Sample[] {
  const samples: Sample[] = [{ x: snap.xm, y: snap.ym, t: 0 }];
  for (let e = 0; e < graph.undirectedEdgeCount; e++) {
    const ta = times[graph.edgeA[e]!]!;
    const tb = times[graph.edgeB[e]!]!;
    if (ta >= cutoffSec && tb >= cutoffSec && e !== snap.edge) continue;
    const len = graph.edgeLenM[e]!;
    const edgeTimeS = graph.edgeTimeCs[e]! / 100;
    const v = len > 0 && edgeTimeS > 0 ? len / edgeTimeS : 0;
    const start = graph.geomOffsets[e]!;
    const end = graph.geomOffsets[e + 1]!;
    let along = 0;
    const emit = (x: number, y: number, d: number): void => {
      let t = v > 0 ? Math.min(ta + d / v, tb + (len - d) / v) : Math.min(ta, tb);
      if (e === snap.edge && v > 0) t = Math.min(t, Math.abs(d - snap.distAlongM) / v);
      if (t <= cutoffSec) samples.push({ x, y, t });
    };
    for (let i = start; i + 1 < end; i++) {
      const ax = graph.geomXm[i]!;
      const ay = graph.geomYm[i]!;
      const bx = graph.geomXm[i + 1]!;
      const by = graph.geomYm[i + 1]!;
      const segLen = Math.hypot(bx - ax, by - ay);
      emit(ax, ay, along);
      for (let s = SAMPLE_STEP_M; s < segLen; s += SAMPLE_STEP_M) {
        const f = s / segLen;
        emit(ax + (bx - ax) * f, ay + (by - ay) * f, along + s);
      }
      along += segLen;
      if (i + 2 === end) emit(bx, by, along);
    }
  }
  return samples;
}

function contourRings(samples: Sample[], cutoffSec: number, graph: WalkGraph): Position[][][] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
  }
  const pad = OFFROAD_BUFFER_M + GRID_CELL_M;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const w = Math.max(4, Math.ceil((maxX - minX) / GRID_CELL_M) + 1);
  const h = Math.max(4, Math.ceil((maxY - minY) / GRID_CELL_M) + 1);
  const values = new Float64Array(w * h).fill(-1);

  for (const s of samples) {
    const r = Math.min((cutoffSec - s.t) * OFFROAD_MPS, OFFROAD_BUFFER_M);
    if (r < 0) continue;
    const cellR = Math.ceil(r / GRID_CELL_M);
    const ci = Math.round((s.x - minX) / GRID_CELL_M);
    const cj = Math.round((s.y - minY) / GRID_CELL_M);
    for (let j = Math.max(0, cj - cellR); j <= Math.min(h - 1, cj + cellR); j++) {
      for (let i = Math.max(0, ci - cellR); i <= Math.min(w - 1, ci + cellR); i++) {
        const dx = minX + i * GRID_CELL_M - s.x;
        const dy = minY + j * GRID_CELL_M - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const g = cutoffSec - (s.t + dist / OFFROAD_MPS);
        const k = j * w + i;
        if (g > values[k]!) values[k] = g;
      }
    }
  }

  const [contour] = contours().size([w, h]).thresholds([0])(Array.from(values));
  if (!contour) return [];
  const minAreaM2 = 1.5 * GRID_CELL_M * GRID_CELL_M;
  const out: Position[][][] = [];
  for (const poly of contour.coordinates) {
    const ringsM = poly.map((ring) =>
      ring.map(([cx, cy]) => [minX + (cx! - 0.5) * GRID_CELL_M, minY + (cy! - 0.5) * GRID_CELL_M] as [number, number]),
    );
    const outer = ringsM[0];
    if (!outer || outer.length < 4 || Math.abs(shoelace(outer)) < minAreaM2) continue;
    out.push(
      ringsM
        .filter((ring) => ring.length >= 4)
        .map((ring) => ring.map(([x, y]) => graph.toLngLat(x, y) as Position)),
    );
  }
  return out;
}

function shoelace(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    area += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  }
  return area / 2;
}

function fallbackCircle(graph: WalkGraph, snap: SnapPoint, cutoffSec: number): Polygon {
  const r = Math.max(40, Math.min(cutoffSec * OFFROAD_MPS, OFFROAD_BUFFER_M));
  const ring: Position[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    ring.push(graph.toLngLat(snap.xm + r * Math.cos(a), snap.ym + r * Math.sin(a)) as Position);
  }
  return { type: 'Polygon', coordinates: [ring] };
}
```
d3-contour note: `contours()(values)` needs a plain array (hence `Array.from`). Its output rings already follow GeoJSON winding. If the calibration test fails by ~half a cell, change `(cx - 0.5)` to `(cx)` (both axes), rerun, and leave a one-line comment stating the empirical result.

- [ ] **Step 9.3:** Run `pnpm --filter @ilsochrone/engine test` — PASS (calibrate the ±0.5 if needed). **Commit:** `git add packages/engine && git commit -m "feat(engine): travel-time raster + marching-squares polygonizer with degraded fallback"`

---

### Task 10: `computeIsochrone` orchestration + property & cross-language tests + final barrel

**Files:**
- Create: `packages/engine/src/isochrone.ts`, `packages/engine/src/__tests__/isochrone.test.ts`, `packages/engine/src/__tests__/cross-language.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces (final public API of `@ilsochrone/engine`):
  - `ENGINE_VERSION = '0.1.0'`
  - `loadGraph(buffer: ArrayBuffer): WalkGraph`
  - `computeIsochrone(graph: WalkGraph, origin: LngLat, minutes: number): IsochroneComputation` — throws `OutOfCoverageError` when unsnappable
  - `readAssetMeta`, `parseAsset`, `snapOrigin`, `shortestTimes`, `SNAP_MAX_M`
  - errors + all types from Task 6.

- [ ] **Step 10.1: Write failing tests.** `src/__tests__/isochrone.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import area from '@turf/area';
import difference from '@turf/difference';
import { feature, featureCollection } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { computeIsochrone } from '../isochrone';
import { loadGraph } from '../graph';
import { OutOfCoverageError } from '../errors';
import { buildAsset } from './helpers/build-asset';

// 3x3 grid, ~200 m spacing, all edges 144 s.
const nodes: [number, number][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) nodes.push([34.78 + c * 0.0021, 32.08 + r * 0.0018]);
const edges: { a: number; b: number; timeS: number }[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    if (c < 2) edges.push({ a: i, b: i + 1, timeS: 144 });
    if (r < 2) edges.push({ a: i, b: i + 3, timeS: 144 });
  }
const GRID = loadGraph(buildAsset({ nodes, edges }));
const CENTER: [number, number] = [34.7821, 32.0818];

describe('computeIsochrone', () => {
  it('returns a polygon containing the origin', () => {
    const { polygon, degraded, snapDistanceM } = computeIsochrone(GRID, CENTER, 5);
    expect(degraded).toBe(false);
    expect(snapDistanceM).toBeLessThan(10);
    expect(booleanPointInPolygon(point(CENTER), feature(polygon))).toBe(true);
  });

  it('nests: 5-min within 10-min within 15-min (small tolerance)', () => {
    const p5 = computeIsochrone(GRID, CENTER, 5).polygon;
    const p10 = computeIsochrone(GRID, CENTER, 10).polygon;
    const p15 = computeIsochrone(GRID, CENTER, 15).polygon;
    for (const [small, big] of [
      [p5, p10],
      [p10, p15],
    ] as const) {
      const leak = difference(featureCollection([feature(small), feature(big)]));
      const leakArea = leak ? area(leak) : 0;
      expect(leakArea).toBeLessThan(0.03 * area(feature(small)));
    }
  });

  it('monotonic area growth', () => {
    const a5 = area(feature(computeIsochrone(GRID, CENTER, 5).polygon));
    const a10 = area(feature(computeIsochrone(GRID, CENTER, 10).polygon));
    expect(a10).toBeGreaterThan(a5);
  });

  it('throws OutOfCoverageError far from the network', () => {
    expect(() => computeIsochrone(GRID, [34.9, 32.2], 10)).toThrow(OutOfCoverageError);
  });

  it('rejects nonsense minutes', () => {
    expect(() => computeIsochrone(GRID, CENTER, 0)).toThrow();
    expect(() => computeIsochrone(GRID, CENTER, -5)).toThrow();
  });
});
```
`src/__tests__/cross-language.test.ts` (guards the Python↔TS binary contract via the committed fixture from Task 5):
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { feature, point } from '@turf/helpers';
import { computeIsochrone } from '../isochrone';
import { loadGraph } from '../graph';
import { snapOrigin, shortestTimes } from '../search';

const raw = readFileSync(join(__dirname, '..', '__fixtures__', 'tiny-walk.v1.bin'));
const GRAPH = loadGraph(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

// Fixture layout: see tools/graph-pipeline/tests/make_fixture.py
// Node osmids sorted ascending -> index: osmid 1..13 -> 0..12, osmid 16 -> 13.
const B_LNG = 34.78;
const B_LAT = 32.08;
const D = 0.0009;

describe('cross-language contract (Python-built asset)', () => {
  it('has the expected structure', () => {
    expect(GRAPH.meta.formatVersion).toBe(1);
    expect(GRAPH.meta.profile).toBe('walk-v1');
    expect(GRAPH.nodeCount).toBe(14);
    expect(GRAPH.undirectedEdgeCount).toBe(19);
  });

  it('reproduces a known shortest path (two ~85 m blocks at 5 km/h)', () => {
    const snap = snapOrigin(GRAPH, [B_LNG, B_LAT])!; // grid corner, osmid 1 -> index 0
    expect(snap.distM).toBeLessThan(2);
    const times = shortestTimes(GRAPH, snap, 1800);
    // osmid 3 (r0c2) -> index 2: 2 * ~84.9 m at 5 km/h ~ 122 s
    expect(times[2]!).toBeGreaterThan(115);
    expect(times[2]!).toBeLessThan(130);
  });

  it('computes a sane 5-minute isochrone', () => {
    const { polygon, degraded } = computeIsochrone(GRAPH, [B_LNG + D, B_LAT + D], 5);
    expect(degraded).toBe(false);
    expect(booleanPointInPolygon(point([B_LNG + D, B_LAT + D]), feature(polygon))).toBe(true);
    // island way 306 was pruned: its area must not be covered
    expect(booleanPointInPolygon(point([34.7876, 32.0872]), feature(polygon))).toBe(false);
  });
});
```
(If Task 4/5 pinned different counts after hand-verification, mirror the same numbers here.)

- [ ] **Step 10.2:** Run — expected FAIL (`isochrone.ts` missing). Implement `src/isochrone.ts`:
```ts
import { OutOfCoverageError } from './errors';
import type { WalkGraph } from './graph';
import { polygonize } from './polygonize';
import { snapOrigin, shortestTimes, SNAP_MAX_M } from './search';
import type { IsochroneComputation, LngLat } from './types';

/** Snap -> bounded Dijkstra -> polygonize. Pure; throws OutOfCoverageError when unsnappable. */
export function computeIsochrone(graph: WalkGraph, origin: LngLat, minutes: number): IsochroneComputation {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new RangeError(`minutes must be a positive number, got ${minutes}`);
  }
  const snap = snapOrigin(graph, origin);
  if (!snap) {
    throw new OutOfCoverageError(
      `No walkable street within ${SNAP_MAX_M} m of [${origin[0]}, ${origin[1]}] — outside the covered area.`,
    );
  }
  const cutoffSec = minutes * 60;
  const times = shortestTimes(graph, snap, cutoffSec);
  const { polygon, degraded } = polygonize(graph, times, snap, cutoffSec);
  return { polygon, degraded, snapDistanceM: snap.distM };
}
```
Final `src/index.ts`:
```ts
export const ENGINE_VERSION = '0.1.0';
export { computeIsochrone } from './isochrone';
export { loadGraph, type WalkGraph } from './graph';
export { readAssetMeta, parseAsset, type ParsedAsset } from './asset/reader';
export { snapOrigin, shortestTimes, SNAP_MAX_M, type SnapPoint } from './search';
export { AssetFormatError, OutOfCoverageError } from './errors';
export type { GraphAssetMeta, GraphSource, IsochroneComputation, LngLat, ProfileId } from './types';
```

- [ ] **Step 10.3:** Run `pnpm --filter @ilsochrone/engine test` (all suites), then `typecheck` + `lint`. All green.

- [ ] **Step 10.4: Commit** — `git add packages/engine && git commit -m "feat(engine): computeIsochrone orchestration, property tests, cross-language contract test"`

---

### Task 11: Build and commit the real Tel Aviv graph asset

**Files:**
- Create (generated + committed): `apps/web/assets/graphs/walk-tlv.v1.bin`

- [ ] **Step 11.1:** In `tools/graph-pipeline/`: `uv run build-graph` (downloads ~100 MB Geofabrik extract into `.cache/` on first run — network required; the download is cached for reruns). Expected output: a report line with node/edge/point counts, size, bbox.

- [ ] **Step 11.2: Sanity-check the report.** Expect roughly: nodes 40k–250k, undirectedEdges 50k–350k, size 2–12 MB, bbox within `(34.74, 31.98, 34.92, 32.20)`. If size wildly exceeds ~15 MB, raise `GEOMETRY_SIMPLIFY_DEG` to `3e-5` and rebuild before committing. Record the exact numbers — ADR-0007 (Task 16) needs them.

- [ ] **Step 11.3: Spot-check with the engine** — add a temporary script or run a one-off vitest with the real asset: 15-min walk from Dizengoff Center `[34.7745, 32.0750]` returns a non-degraded polygon containing the origin. (The permanent perf test lands in Task 12.)

- [ ] **Step 11.4: Commit** — `git add apps/web/assets && git commit -m "feat(data): committed Tel Aviv metro walk-graph asset (walk-tlv.v1)"` (include the count report in the commit body).

---

### Task 12: Providers — `BundledGraphSource` + `LocalIsochroneProvider` + `/server` subpath

**Files:**
- Create: `packages/providers/src/isochrone/bundled-source.ts`, `packages/providers/src/isochrone/local.ts`, `packages/providers/src/isochrone/local.test.ts`, `packages/providers/src/server.ts`
- Modify: `packages/providers/src/types.ts` (optional `engine` metadata), `packages/providers/package.json` (engine dep, `./server` export)

**Interfaces:**
- Consumes: `@ilsochrone/engine` public API (Task 10), existing `IsochroneProvider`/`IsochroneRequestSchema`/`ProviderMetadata`.
- Produces:
  - `BundledGraphSource implements GraphSource` — `constructor(opts?: { assetPath?: string })`, name `'bundled'`; reads the committed asset via `node:fs/promises`; module-level cache keyed by resolved path; default path candidates (first that exists wins): `join(process.cwd(), 'assets/graphs/walk-tlv.v1.bin')`, `join(process.cwd(), 'apps/web/assets/graphs/walk-tlv.v1.bin')`, `join(process.cwd(), '../../apps/web/assets/graphs/walk-tlv.v1.bin')`.
  - `LocalIsochroneProvider implements IsochroneProvider` — `constructor(opts: { source: GraphSource })`, name `'local'`, supports `'walk'` only; caches the loaded `WalkGraph` promise; metadata `{ provider: 'local', computedAt, engine: { version, profile, graphBuiltAt, osmSnapshot }, warnings?: [{ code: 'degraded_polygon', ... }] }`.
  - `ProviderMetadata` gains `engine?: { version: string; profile: string; graphBuiltAt: string; osmSnapshot: string }`.
  - **CRITICAL:** neither class is exported from `src/index.ts` or `src/isochrone/index.ts` (they would drag `node:fs` / engine weight into the client bundle). They are exported ONLY from the new `src/server.ts`, published as the `"./server"` subpath.

- [ ] **Step 12.1:** `package.json` edits: add to exports map `"./server": "./src/server.ts"`; add `"@ilsochrone/engine": "workspace:*"` to dependencies; add devDeps `"@turf/area": "^7.1.0"`, `"@turf/intersect": "^7.1.0"`, `"@turf/union": "^7.1.0"`, `"@turf/helpers": "^7.1.0"` (used by Task 14's script). Run `pnpm install`.

- [ ] **Step 12.2:** Extend `src/types.ts` — append to `ProviderMetadata`:
```ts
export interface ProviderMetadata {
  provider: string;
  computedAt: string;
  warnings?: ProviderWarning[];
  /** Present when a self-maintained engine produced the result — staleness is always visible. */
  engine?: {
    version: string;
    profile: string;
    graphBuiltAt: string;
    osmSnapshot: string;
  };
}
```

- [ ] **Step 12.3: Write failing tests** `src/isochrone/local.test.ts` (mirror `ors.test.ts` style; uses the engine fixture asset — no network, no fs coupling beyond the fixture):
```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAssetMeta, type GraphSource } from '@ilsochrone/engine';
import { LocalIsochroneProvider } from './local';
import { BundledGraphSource } from './bundled-source';

const FIXTURE = join(__dirname, '..', '..', '..', 'engine', 'src', '__fixtures__', 'tiny-walk.v1.bin');
const REAL_ASSET = join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'assets', 'graphs', 'walk-tlv.v1.bin');

function fixtureSource(): GraphSource {
  return {
    name: 'fixture',
    async load() {
      const raw = await readFile(FIXTURE);
      const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      return { buffer, meta: readAssetMeta(buffer) };
    },
  };
}

describe('LocalIsochroneProvider', () => {
  it('supports walk only', () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    expect(p.supports('walk')).toBe(true);
    expect(p.supports('bike')).toBe(false);
    expect(p.supports('transit')).toBe(false);
  });

  it('computes an isochrone with engine metadata', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    const res = await p.getIsochrone({ origin: [34.7809, 32.0809], mode: 'walk', minutes: 5 });
    expect(['Polygon', 'MultiPolygon']).toContain(res.polygon.type);
    expect(res.metadata.provider).toBe('local');
    expect(res.metadata.engine?.version).toBeTruthy();
    expect(res.metadata.engine?.profile).toBe('walk-v1');
    expect(res.metadata.warnings ?? []).toEqual([]);
  });

  it('rejects invalid requests via the shared schema', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    await expect(
      p.getIsochrone({ origin: [34.78, 32.08], mode: 'walk', minutes: 7 as never }),
    ).rejects.toThrow();
  });

  it('propagates OutOfCoverageError for far origins', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    await expect(
      p.getIsochrone({ origin: [35.5, 33.0], mode: 'walk', minutes: 10 }),
    ).rejects.toMatchObject({ name: 'OutOfCoverageError' });
  });

  it('loads the graph once across calls', async () => {
    let loads = 0;
    const src = fixtureSource();
    const counting: GraphSource = {
      name: 'counting',
      load: (profile) => {
        loads++;
        return src.load(profile);
      },
    };
    const p = new LocalIsochroneProvider({ source: counting });
    await p.getIsochrone({ origin: [34.7809, 32.0809], mode: 'walk', minutes: 5 });
    await p.getIsochrone({ origin: [34.7809, 32.0809], mode: 'walk', minutes: 10 });
    expect(loads).toBe(1);
  });
});

describe('BundledGraphSource', () => {
  it('loads an explicit asset path', async () => {
    const src = new BundledGraphSource({ assetPath: FIXTURE });
    const { buffer, meta } = await src.load('walk');
    expect(meta.formatVersion).toBe(1);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });

  it('falls back to cwd candidates and finds the real asset', async () => {
    const src = new BundledGraphSource();
    const { meta } = await src.load('walk');
    expect(meta.profile).toBe('walk-v1');
  });

  it('fails loudly on a missing path', async () => {
    const src = new BundledGraphSource({ assetPath: 'C:/nope/missing.bin' });
    await expect(src.load('walk')).rejects.toThrow(/graph asset/i);
  });
});

describe('perf guard (real asset)', () => {
  it('computes a 30-min isochrone under budget when warm', async () => {
    const p = new LocalIsochroneProvider({ source: new BundledGraphSource({ assetPath: REAL_ASSET }) });
    const req = { origin: [34.7745, 32.075] as [number, number], mode: 'walk' as const, minutes: 30 as const };
    await p.getIsochrone(req); // cold: load + parse
    const t0 = performance.now();
    await p.getIsochrone(req);
    const ms = performance.now() - t0;
    console.log(`30-min isochrone (warm): ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(process.env.CI ? 1000 : 200);
  });
});
```

- [ ] **Step 12.4:** Run `pnpm --filter @ilsochrone/providers test local` — expected FAIL. Implement.

`src/isochrone/bundled-source.ts`:
```ts
/**
 * BundledGraphSource — reads the walk-graph asset committed to the deployment.
 * Server-side only (node:fs). Exported via '@ilsochrone/providers/server' ONLY.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAssetMeta, type GraphAssetMeta, type GraphSource, type ProfileId } from '@ilsochrone/engine';

const ASSET_FILENAME = 'walk-tlv.v1.bin';

/** cwd-relative candidates: next dev/build (apps/web), Vercel lambda (traced repo layout), package tests. */
function defaultCandidates(): string[] {
  return [
    join(process.cwd(), 'assets', 'graphs', ASSET_FILENAME),
    join(process.cwd(), 'apps', 'web', 'assets', 'graphs', ASSET_FILENAME),
    join(process.cwd(), '..', '..', 'apps', 'web', 'assets', 'graphs', ASSET_FILENAME),
  ];
}

const cache = new Map<string, Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }>>();

export interface BundledGraphSourceOptions {
  /** Explicit absolute path to the asset; overrides candidate resolution. */
  assetPath?: string;
}

export class BundledGraphSource implements GraphSource {
  readonly name = 'bundled';
  private readonly assetPath: string | undefined;

  constructor(opts?: BundledGraphSourceOptions) {
    this.assetPath = opts?.assetPath;
  }

  load(_profile: ProfileId): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }> {
    const key = this.assetPath ?? 'auto';
    let entry = cache.get(key);
    if (!entry) {
      entry = this.read();
      cache.set(key, entry);
      entry.catch(() => cache.delete(key)); // don't cache failures
    }
    return entry;
  }

  private async read(): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }> {
    const candidates = this.assetPath ? [this.assetPath] : defaultCandidates();
    for (const path of candidates) {
      try {
        const raw = await readFile(path);
        const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
        return { buffer, meta: readAssetMeta(buffer) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
    throw new Error(
      `BundledGraphSource: graph asset "${ASSET_FILENAME}" not found. Tried: ${candidates.join(' | ')}`,
    );
  }
}
```
`src/isochrone/local.ts`:
```ts
/**
 * LocalIsochroneProvider — the self-maintained engine behind the standard
 * IsochroneProvider seam (spec §7). Server-side only via '@ilsochrone/providers/server'.
 */
import {
  computeIsochrone,
  loadGraph,
  ENGINE_VERSION,
  type GraphSource,
  type WalkGraph,
} from '@ilsochrone/engine';
import {
  IsochroneRequestSchema,
  type IsochroneProvider,
  type IsochroneRequest,
  type IsochroneResult,
} from './types';
import type { ProviderWarning, TravelMode } from '../types';

export interface LocalIsochroneOptions {
  source: GraphSource;
}

export class LocalIsochroneProvider implements IsochroneProvider {
  readonly name = 'local';

  private readonly source: GraphSource;
  private graphPromise: Promise<WalkGraph> | null = null;

  constructor(opts: LocalIsochroneOptions) {
    this.source = opts.source;
  }

  supports(mode: TravelMode): boolean {
    return mode === 'walk';
  }

  async getIsochrone(reqInput: IsochroneRequest): Promise<IsochroneResult> {
    const req = IsochroneRequestSchema.parse(reqInput);
    if (!this.supports(req.mode)) {
      throw new Error(`local engine does not support mode "${req.mode}" yet`);
    }
    const graph = await this.getGraph();
    const { polygon, degraded } = computeIsochrone(graph, req.origin, req.minutes);
    const warnings: ProviderWarning[] | undefined = degraded
      ? [
          {
            code: 'degraded_polygon',
            message: 'Isochrone fell back to a minimal buffer around the origin.',
          },
        ]
      : undefined;
    return {
      polygon,
      metadata: {
        provider: this.name,
        computedAt: new Date().toISOString(),
        engine: {
          version: ENGINE_VERSION,
          profile: graph.meta.profile,
          graphBuiltAt: graph.meta.buildTimestamp,
          osmSnapshot: graph.meta.osmSnapshot,
        },
        ...(warnings ? { warnings } : {}),
      },
    };
  }

  private getGraph(): Promise<WalkGraph> {
    if (!this.graphPromise) {
      this.graphPromise = this.source.load('walk').then(({ buffer }) => loadGraph(buffer));
      this.graphPromise.catch(() => {
        this.graphPromise = null; // allow retry after a failed load
      });
    }
    return this.graphPromise;
  }
}
```
`src/server.ts`:
```ts
/**
 * Server-only exports — anything touching node:fs or the engine runtime.
 * Import as '@ilsochrone/providers/server'. NEVER re-export from the main barrel:
 * the client bundle imports the barrel for types/constants.
 */
export { BundledGraphSource, type BundledGraphSourceOptions } from './isochrone/bundled-source';
export { LocalIsochroneProvider, type LocalIsochroneOptions } from './isochrone/local';
export {
  AssetFormatError,
  OutOfCoverageError,
  ENGINE_VERSION,
  type GraphAssetMeta,
  type GraphSource,
} from '@ilsochrone/engine';
```

- [ ] **Step 12.5:** Run `pnpm --filter @ilsochrone/providers test` (all, including existing ors tests) → PASS; `typecheck` + `lint` → clean. Note the perf number printed by the guard.

- [ ] **Step 12.6: Commit** — `git add packages/providers pnpm-lock.yaml && git commit -m "feat(providers): LocalIsochroneProvider + BundledGraphSource behind server-only subpath"`

---

### Task 13: Web integration — provider selection, 422, fallback, tracing

**Files:**
- Create: `apps/web/src/lib/server/isochrone-providers.ts`, `apps/web/src/lib/server/isochrone-providers.test.ts`
- Modify: `apps/web/src/app/api/isochrone/route.ts`, `apps/web/next.config.mjs`, `apps/web/.env.example`, `apps/web/src/app/page.tsx`, `apps/web/package.json` (add `@ilsochrone/engine` nothing — engine arrives transitively; no change needed), `turbo.json`

**Interfaces:**
- Produces: `getIsochroneProviders(): { primary: IsochroneProvider; fallback: IsochroneProvider | null }` honoring `ISOCHRONE_PROVIDER` (`'ors' | 'local'`, default **`'ors'` until Task 15**) and `ISOCHRONE_FALLBACK` (`'ors'` enables fallback when primary is local and `ORS_API_KEY` exists); `MissingApiKeyError`; `__resetIsochroneProvidersForTests()`. Route behavior: `OutOfCoverageError → 422 { error: 'out_of_coverage', message }`; fallback used for engine errors EXCEPT out-of-coverage; everything else unchanged.

- [ ] **Step 13.1: Write failing factory tests** `apps/web/src/lib/server/isochrone-providers.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { getIsochroneProviders, MissingApiKeyError, __resetIsochroneProvidersForTests } from './isochrone-providers';

const ENV_KEYS = ['ISOCHRONE_PROVIDER', 'ISOCHRONE_FALLBACK', 'ORS_API_KEY', 'ISOCHRONE_GRAPH_PATH'] as const;
const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetIsochroneProvidersForTests();
});

describe('getIsochroneProviders', () => {
  it('selects local when ISOCHRONE_PROVIDER=local, no fallback by default', () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    delete process.env.ISOCHRONE_FALLBACK;
    const { primary, fallback } = getIsochroneProviders();
    expect(primary.name).toBe('local');
    expect(fallback).toBeNull();
  });

  it('selects ors when ISOCHRONE_PROVIDER=ors and key exists', () => {
    process.env.ISOCHRONE_PROVIDER = 'ors';
    process.env.ORS_API_KEY = 'test-key';
    expect(getIsochroneProviders().primary.name).toBe('ors');
  });

  it('throws MissingApiKeyError for ors without a key', () => {
    process.env.ISOCHRONE_PROVIDER = 'ors';
    delete process.env.ORS_API_KEY;
    expect(() => getIsochroneProviders()).toThrow(MissingApiKeyError);
  });

  it('wires the ors fallback for local when requested and key exists', () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    process.env.ISOCHRONE_FALLBACK = 'ors';
    process.env.ORS_API_KEY = 'test-key';
    const { fallback } = getIsochroneProviders();
    expect(fallback?.name).toBe('ors');
  });

  it('silently skips the fallback when no ors key exists', () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    process.env.ISOCHRONE_FALLBACK = 'ors';
    delete process.env.ORS_API_KEY;
    expect(getIsochroneProviders().fallback).toBeNull();
  });
});
```

- [ ] **Step 13.2:** Run `pnpm --filter @ilsochrone/web test` — expected FAIL. Implement `apps/web/src/lib/server/isochrone-providers.ts`:
```ts
/**
 * Server-side isochrone provider selection (spec §7).
 * ISOCHRONE_PROVIDER=local|ors picks the adapter; ISOCHRONE_FALLBACK=ors adds
 * an ORS fallback for unexpected engine errors (never for out-of-coverage).
 */
import { OrsIsochroneProvider, type IsochroneProvider } from '@ilsochrone/providers';
import { BundledGraphSource, LocalIsochroneProvider } from '@ilsochrone/providers/server';

// Flipped to 'local' after the ORS validation run (rollout §10).
const DEFAULT_PROVIDER = 'ors';

export class MissingApiKeyError extends Error {
  constructor() {
    super('ORS_API_KEY is not set on the server.');
    this.name = 'MissingApiKeyError';
  }
}

export interface IsochroneProviders {
  primary: IsochroneProvider;
  fallback: IsochroneProvider | null;
}

let cached: IsochroneProviders | null = null;

function makeOrs(): OrsIsochroneProvider {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  return new OrsIsochroneProvider({ apiKey });
}

function makeLocal(): LocalIsochroneProvider {
  return new LocalIsochroneProvider({
    source: new BundledGraphSource(
      process.env.ISOCHRONE_GRAPH_PATH ? { assetPath: process.env.ISOCHRONE_GRAPH_PATH } : undefined,
    ),
  });
}

export function getIsochroneProviders(): IsochroneProviders {
  if (cached) return cached;
  const choice = process.env.ISOCHRONE_PROVIDER ?? DEFAULT_PROVIDER;
  if (choice === 'local') {
    const wantFallback = process.env.ISOCHRONE_FALLBACK === 'ors' && !!process.env.ORS_API_KEY;
    cached = { primary: makeLocal(), fallback: wantFallback ? makeOrs() : null };
  } else if (choice === 'ors') {
    cached = { primary: makeOrs(), fallback: null };
  } else {
    throw new Error(`Unknown ISOCHRONE_PROVIDER "${choice}" (expected 'local' or 'ors')`);
  }
  return cached;
}

export function __resetIsochroneProvidersForTests(): void {
  cached = null;
}
```

- [ ] **Step 13.3: Rewire the route.** In `apps/web/src/app/api/isochrone/route.ts`:
  1. Replace the imports/`getProvider`/`MissingApiKeyError` block: drop the local `let provider ... getProvider()` and the in-file `MissingApiKeyError`; import `{ getIsochroneProviders, MissingApiKeyError } from '@/lib/server/isochrone-providers'` and add `OutOfCoverageError` to the `@ilsochrone/providers/server` import line (`import { OutOfCoverageError } from '@ilsochrone/providers/server';`). Keep `OrsError` import from `@ilsochrone/providers`.
  2. Replace the try block of `GET`:
```ts
  try {
    const { primary, fallback } = getIsochroneProviders();
    let result;
    try {
      result = await primary.getIsochrone(req);
    } catch (err) {
      if (err instanceof OutOfCoverageError || !fallback) throw err;
      console.warn('[/api/isochrone] primary provider failed; falling back to ors', summarize(err));
      result = await fallback.getIsochrone(req);
    }
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
```
  3. In `errorResponse`, add BEFORE the `OrsError` branch:
```ts
  if (err instanceof OutOfCoverageError) {
    return NextResponse.json(
      { error: 'out_of_coverage', message: err.message },
      { status: 422 },
    );
  }
```
  4. Update the file-header error-contract comment to list 422.

- [ ] **Step 13.4: Frontend copy.** In `apps/web/src/app/page.tsx`, `errorMessage()` gains one branch (before the 429 line):
```ts
    if (status === 422) return 'This spot is outside the covered area (Tel Aviv metro).';
```

- [ ] **Step 13.5: Config plumbing.**
  - `apps/web/next.config.mjs`: add `'@ilsochrone/engine'` to `transpilePackages`; add
```js
  experimental: {
    outputFileTracingIncludes: {
      '/api/isochrone': ['./assets/graphs/**'],
    },
  },
```
  (If the Next 14 minor in use wants `outputFileTracingIncludes` at top level instead of under `experimental`, follow the build warning — the build must stay warning-free.)
  - `turbo.json`: add `ISOCHRONE_PROVIDER`, `ISOCHRONE_FALLBACK`, `ISOCHRONE_GRAPH_PATH` to the `build` and `dev` env allowlists.
  - `apps/web/.env.example`: replace the commented `# NEXT_PUBLIC_ISOCHRONE_PROVIDER=ors` line with:
```
# Isochrone engine selection (server-side): 'ors' (hosted) or 'local' (self-maintained engine).
# ISOCHRONE_PROVIDER=ors
# Optional: fall back to ORS if the local engine errors unexpectedly.
# ISOCHRONE_FALLBACK=ors
```

- [ ] **Step 13.6: Route-level integration test** — append to the factory test file (real bundled asset, no network):
```ts
describe('route integration (local provider)', () => {
  it('maps an out-of-coverage origin to 422', async () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    delete process.env.ISOCHRONE_FALLBACK;
    __resetIsochroneProvidersForTests();
    const { GET } = await import('../../app/api/isochrone/route');
    // Jerusalem — far outside the Tel Aviv clip bbox
    const res = await GET(new Request('http://test/api/isochrone?lng=35.2137&lat=31.7683&t=15&mode=walk'));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('out_of_coverage');
  });

  it('serves a walk isochrone from the bundled asset', async () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    __resetIsochroneProvidersForTests();
    const { GET } = await import('../../app/api/isochrone/route');
    const res = await GET(new Request('http://test/api/isochrone?lng=34.7745&lat=32.075&t=15&mode=walk'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(['Polygon', 'MultiPolygon']).toContain(body.polygon.type);
    expect(body.metadata.provider).toBe('local');
    expect(body.metadata.engine.version).toBeTruthy();
  });
});
```
(Web tests run with cwd `apps/web`, so `BundledGraphSource` resolves the asset via its first candidate, `join(cwd, 'assets/graphs', ...)` — no explicit path needed.)

- [ ] **Step 13.7:** Run `pnpm --filter @ilsochrone/web test`, then repo-wide `pnpm typecheck && pnpm lint && pnpm build`. The build must succeed — it proves the client bundle stays free of `node:fs` (if it fails there, a server-only symbol leaked into the main barrel; fix the import, not the config). Manual smoke: `ISOCHRONE_PROVIDER=local pnpm --filter @ilsochrone/web dev` + `curl "http://localhost:3000/api/isochrone?lng=34.7745&lat=32.075&t=15&mode=walk"` → 200 with `"provider":"local"`.

- [ ] **Step 13.8: Commit** — `git add apps/web turbo.json && git commit -m "feat(web): ISOCHRONE_PROVIDER selection, out-of-coverage 422, optional ORS fallback"`

---

### Task 14: ORS validation — IoU comparison script + recorded results

**Files:**
- Create: `packages/providers/scripts/compare-ors.test.ts`, `packages/providers/vitest.compare.config.ts`, `docs/research/02-local-vs-ors-iou.md` (generated results)
- Modify: `packages/providers/package.json` (script `compare:ors`)

**Interfaces:**
- Consumes: `LocalIsochroneProvider`, `OrsIsochroneProvider`, real asset, `ORS_API_KEY` (read from env or parsed out of `apps/web/.env.local`).
- Produces: `pnpm --filter @ilsochrone/providers compare:ors` printing an IoU table and writing `docs/research/02-local-vs-ors-iou.md`. Target: mean IoU ≥ 0.75 (gross-disagreement detector, spec §9).

- [ ] **Step 14.1:** `vitest.compare.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/compare-ors.test.ts'],
    environment: 'node',
    testTimeout: 600_000,
  },
});
```
package.json script: `"compare:ors": "vitest run --config vitest.compare.config.ts"`.

- [ ] **Step 14.2:** `scripts/compare-ors.test.ts`:
```ts
/**
 * Reality-check: local engine vs ORS, IoU over 10 origins x 3 time bands (spec §9).
 * Run: pnpm --filter @ilsochrone/providers compare:ors   (needs ORS_API_KEY or apps/web/.env.local)
 * Writes docs/research/02-local-vs-ors-iou.md. Skips silently without a key.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import area from '@turf/area';
import intersect from '@turf/intersect';
import union from '@turf/union';
import { feature, featureCollection } from '@turf/helpers';
import type { Polygon, MultiPolygon } from 'geojson';
import { OrsIsochroneProvider } from '../src/isochrone/ors';
import { LocalIsochroneProvider } from '../src/isochrone/local';
import { BundledGraphSource } from '../src/isochrone/bundled-source';

const REPO = join(__dirname, '..', '..', '..');
const OUT = join(REPO, 'docs', 'research', '02-local-vs-ors-iou.md');
const ASSET = join(REPO, 'apps', 'web', 'assets', 'graphs', 'walk-tlv.v1.bin');

function orsKey(): string | null {
  if (process.env.ORS_API_KEY) return process.env.ORS_API_KEY;
  const envFile = join(REPO, 'apps', 'web', '.env.local');
  if (!existsSync(envFile)) return null;
  const m = readFileSync(envFile, 'utf8').match(/^ORS_API_KEY=(.+)$/m);
  return m ? m[1]!.trim() : null;
}

const ORIGINS: Array<[string, number, number]> = [
  ['Dizengoff Center', 34.7745, 32.075],
  ['Tel Aviv Port', 34.7754, 32.0966],
  ['Jaffa Clock Tower', 34.7522, 32.0543],
  ['Ramat Gan Diamond District', 34.8039, 32.0839],
  ['Tel Aviv University', 34.8044, 32.1133],
  ['Bnei Brak', 34.8338, 32.0807],
  ['Holon Center', 34.7722, 32.0114],
  ['Bat Yam', 34.7519, 32.0171],
  ['Herzliya Center', 34.8447, 32.1663],
  ['Neve Tzedek', 34.7639, 32.0609],
];
const BANDS = [5, 15, 30] as const;

function iou(a: Polygon | MultiPolygon, b: Polygon | MultiPolygon): number {
  const fa = feature(a);
  const fb = feature(b);
  const inter = intersect(featureCollection([fa, fb]));
  if (!inter) return 0;
  const uni = union(featureCollection([fa, fb]));
  return uni ? area(inter) / area(uni) : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('local vs ORS IoU', () => {
  const key = orsKey();
  it.skipIf(!key)('mean IoU >= 0.75 across 10 origins x 3 bands', async () => {
    const ors = new OrsIsochroneProvider({ apiKey: key! });
    const local = new LocalIsochroneProvider({ source: new BundledGraphSource({ assetPath: ASSET }) });
    const rows: string[] = ['| Origin | Band (min) | IoU |', '| --- | --- | --- |'];
    const scores: number[] = [];
    for (const [name, lng, lat] of ORIGINS) {
      for (const minutes of BANDS) {
        const req = { origin: [lng, lat] as [number, number], mode: 'walk' as const, minutes };
        const [mine, theirs] = [await local.getIsochrone(req), await ors.getIsochrone(req)];
        const score = iou(mine.polygon, theirs.polygon);
        scores.push(score);
        rows.push(`| ${name} | ${minutes} | ${score.toFixed(3)} |`);
        console.log(`${name} ${minutes}min IoU=${score.toFixed(3)}`);
        await sleep(3500); // ORS free tier: 20 req/min
      }
    }
    const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
    const doc = [
      '# Local engine vs ORS — IoU validation',
      '',
      `_Run: ${new Date().toISOString().slice(0, 10)} · asset: walk-tlv.v1 · target: mean IoU >= 0.75 (spec §9)_`,
      '',
      ...rows,
      '',
      `**Mean IoU: ${mean.toFixed(3)}** (min ${Math.min(...scores).toFixed(3)}, max ${Math.max(...scores).toFixed(3)})`,
      '',
    ].join('\n');
    writeFileSync(OUT, doc);
    console.log(`mean IoU: ${mean.toFixed(3)} -> ${OUT}`);
    expect(mean).toBeGreaterThanOrEqual(0.75);
  }, 600_000);

  it('asset exists for comparison', () => {
    expect(existsSync(ASSET)).toBe(true);
  });
});
```

- [ ] **Step 14.3:** Run `pnpm --filter @ilsochrone/providers compare:ors` (~2–3 min due to rate-limit spacing). Investigate ANY origin×band with IoU < 0.5 before accepting (common causes: overly strict tag filter dropping crossings, speed model gap, polygonizer buffer too tight/loose). Tuning knobs, in order: `ALLOWED_HIGHWAY` additions (e.g. `crossing` is not a highway value — but `path`/`track` variants), `OFFROAD_BUFFER_M`, `GRID_CELL_M`. Rebuild the asset (Task 11) after pipeline changes and rerun. If mean stays < 0.75 after two tuning rounds, record the honest number + analysis in the results doc and DO NOT flip the default in Task 15 — leave `ors` default, note it in ADR-0007, and surface the discrepancy in the final report to the user.

- [ ] **Step 14.4: Commit** — `git add packages/providers docs/research && git commit -m "test(providers): ORS-vs-local IoU validation script + recorded results"`

---

### Task 15: Flip the default to `local`

Only if Task 14 met the IoU target.

- [ ] **Step 15.1:** In `apps/web/src/lib/server/isochrone-providers.ts`: `const DEFAULT_PROVIDER = 'local';` (update its comment). In `apps/web/.env.example`: mark `ORS_API_KEY` as optional (`# Optional — only needed for ISOCHRONE_PROVIDER=ors or ISOCHRONE_FALLBACK=ors`), uncomment nothing.
- [ ] **Step 15.2:** Adjust the factory test expectation: default (env unset) now yields `primary.name === 'local'` — add that test case.
- [ ] **Step 15.3:** Full verify: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus pipeline `uv run pytest`. All green. Manual smoke with NO env vars: `pnpm --filter @ilsochrone/web dev` + the Task 13 curl → 200 `"provider":"local"`.
- [ ] **Step 15.4: Commit** — `git add apps/web && git commit -m "feat(web): local engine is the default isochrone provider"`

---

### Task 16: Docs, ADR-0007, CI

**Files:**
- Create: `docs/adr/0007-self-maintained-isochrone-engine.md`
- Modify: `docs/PRD.md` (architecture section), `docs/TASKS.md`, `docs/DEVELOPING.md`, `.github/workflows/ci.yml`, `README.md` (stack blurb if it names ORS)

- [ ] **Step 16.1: ADR-0007** — structure: Status (Accepted, supersedes ADR-0002's MVP/ORS section), Context (prototype→product, zero-cost, no serverless-native engine exists — cite spec §2 research), Decision (own the core: Python pipeline → versioned binary asset → pure-TS engine; formats and seams), Consequences (we own correctness + data freshness; weekly rebuild is a designed-for follow-up via `RemoteGraphSource`; cycling = second profile), Validation (paste the real-asset counts from Task 11, the perf number from Task 12, and the IoU table summary from Task 14), Rollout state (default flipped or not).
- [ ] **Step 16.2: PRD** — update the architecture diagram/description: isochrone computation now in-repo (`packages/engine` + committed graph asset); ORS demoted to optional fallback. Keep the diagram style consistent with what's there.
- [ ] **Step 16.3: TASKS.md** — add completed entries (T-18 "Self-maintained isochrone engine" with subitems pipeline/engine/provider/validation) so the sprint log reflects reality.
- [ ] **16.4: DEVELOPING.md** — new "Graph pipeline" section: prerequisites (uv), commands (`uv sync`, `uv run build-graph`, `uv run pytest`), when to rebuild the asset, pointer to `docs/reference/graph-asset-format.md`.
- [ ] **Step 16.5: CI** — append a second job to `.github/workflows/ci.yml`:
```yaml
  pipeline:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
          cache-dependency-glob: tools/graph-pipeline/uv.lock
      - name: Pipeline tests
        working-directory: tools/graph-pipeline
        run: |
          uv sync
          uv run pytest -v
```
- [ ] **Step 16.6:** Run `pnpm format` (prettier over changed md/ts), commit: `git add -A && git commit -m "docs: ADR-0007 self-maintained isochrone engine, PRD/TASKS/DEVELOPING updates, pipeline CI job"`

---

## Self-Review (run after writing, before execution)

1. **Spec coverage:** §3 architecture → Tasks 1–13; §4 pipeline steps 1–5 → Tasks 1–5, 11; §5 format+GraphSource → Tasks 2, 6, 12; §6 engine → Tasks 7–10; §7 provider → Tasks 12–13; §8 error table → Tasks 9 (degraded), 12 (metadata flag), 13 (422, fallback, loud load failure); §9 testing → every task + 12 (perf), 14 (IoU), cross-language in 10; §10 rollout → Tasks 11→13 (behind flag)→14 (validate)→15 (flip)→16 (ADR-0007+PRD); §11 non-goals → nothing here builds transit/cycling/remote-source/browser-compute/UI changes (the 422 copy line is error handling required by §8, not UI elevation).
2. **Placeholder scan:** none — every code step carries full code; the two "calibrate/adapt" notes (d3-contour ±0.5 offset, OSMnx kwarg name) are empirical library-version checks with explicit tests as arbiters, not deferred design.
3. **Type consistency:** `GraphSource.load(profile) → {buffer, meta}` consistent across engine types, bundled-source, local.ts; `SnapPoint` fields consistent between search.ts/polygonize.ts; `GraphAssetMeta` field names identical in Python meta JSON, format doc, and TS type; `IsochroneComputation` consistent between engine and local.ts usage; counts (14 nodes/19 edges) consistent between test_build.py and cross-language.test.ts.

## Execution

Subagent-driven (superpowers:subagent-driven-development): fresh subagent per task, review between tasks. Tasks are strictly ordered — no parallel dispatch (each builds on committed state of the previous). If a task's tests can't be made green after two honest attempts, stop and record the blocker in the task report rather than watering down assertions.
