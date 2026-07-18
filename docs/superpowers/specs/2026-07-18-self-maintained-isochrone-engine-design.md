# Self-Maintained Isochrone Engine — Design

_Status: Approved design · Owner: Tomer · Date: 2026-07-18_

## 1. Goal

Replace the third-party isochrone calculation (OpenRouteService hosted API) with a
self-maintained engine owned by this repo, so ilsochrone's core feature has no external
runtime dependency, no rate limits, and no API keys. This is the first step in graduating
the project from prototype to a real product.

**Constraints:**

- Zero monthly cost — Vercel free tier hosting, no paid compute/storage anywhere.
- Walking first; cycling and transit are designed-for follow-ups, not built now.
- Coverage: Tel Aviv metro (Herzliya → Bat Yam), tunable.
- The public `IsochroneProvider` contract and the UI do not change.

**Prototype framing:** the existing repo state is treated as a prototype. Existing code
(including the provider interfaces) is kept where it serves the higher-grade product and
may be changed or discarded where it doesn't. The `IsochroneProvider` seam is retained
because it is the right boundary, not out of legacy obligation.

## 2. Why not an existing engine

No production-grade isochrone engine runs natively in Node/serverless. Valhalla, OSRM,
GraphHopper, and OTP are C++/Java servers requiring a persistent host, which the
zero-cost constraint rules out (free container tiers sleep and cold-start for ~a minute).
Valhalla-in-WASM is experimental and imports someone else's build complexity. Open-source
*building blocks* (OSM parsing, graph search, turf geometry) are mature — so we own the
core (graph model, search, polygon extraction) and lean on libraries for commodity parts.

### Prior-art research (2026-07-18)

- **OSM → walk-graph tooling is a Python story.** [pyrosm](https://pyrosm.readthedocs.io/)
  (v0.11.0, active 2026) reads local Geofabrik PBF dumps — no Overpass dependency, which
  this project already distrusts — and extracts walking networks into graph form at
  city-to-country scale. [OSMnx](https://osmnx.readthedocs.io/) 2.x is the canonical
  street-network toolkit (simplification, bidirectional walk graphs, analysis/plotting).
  [QuackOSM](https://github.com/kraina-ai/quackosm) (DuckDB-based) is a modern alternative
  for country-scale extracts if pyrosm ever falls short. The Node ecosystem offers only
  low-level PBF parsers (osm-pbf-parser-node, osm-read) — graph building, walkability
  profiles, and simplification would all be hand-rolled.
- **Broadened survey (round 2) found no adoptable engine.** JS pathfinding libs
  ([geojson-path-finder](https://github.com/perliedman/geojson-path-finder),
  [ngraph.path](https://github.com/anvaka/ngraph.path), jKstra) do point-to-point routes
  only — none expose the cutoff search + reached-set output an isochrone needs, and none
  use a compact preprocessed graph format. The npm
  [`isochrone`](https://libraries.io/npm/isochrone) package (OSRM bindings + concaveman)
  is abandoned (last release 2018); mapbox/osrm-isochrone is archived. On the Rust side,
  [osm_graph/pysochrone](https://docs.rs/osm_graph) is the closest match in spirit but
  early-stage (v0.2.0, ~12% documented, July 2026) — watchable, not adoptable; Rust→WASM
  remains a future perf escape hatch we won't need at Tel Aviv scale. These findings
  validate owning the core.
- **Polygon extraction: "isochrones are not alpha shapes."** Concave hulls / alpha shapes
  over reached nodes are parameter-sensitive and can degenerate; production engines
  (Valhalla) instead rasterize travel times onto a grid and contour it with marching
  squares — robust, deterministic, and naturally produces MultiPolygons with holes for
  unreachable pockets. Alpha shapes remain acceptable at city scale but are the weaker
  option.

## 3. Architecture

```
tools/graph-pipeline       build-time Python project (uv-managed, never deployed)
    OSM extract ──► walkable street graph ──► compact binary asset (2–5 MB)

packages/engine            runtime, pure TypeScript (no Node APIs)
    GraphSource ──► snap origin ──► Dijkstra with cutoff ──► GeoJSON polygon

packages/providers         existing package
    + LocalIsochroneProvider ('local') wrapping the engine
    ORS adapter retained as fallback/comparison behind an env flag
```

**Language split:** the pipeline is Python — that's where all the OSM prior art lives
(pyrosm, OSMnx, shapely/geopandas) — while everything deployed stays TypeScript. The
**versioned binary asset is the language-neutral contract** between the two: its format
is specified in a short reference doc, the pipeline has Python-side tests, and a small
fixture asset checked into the repo gives the TS engine a cross-language round-trip test.
The pipeline lives in `tools/` (own `pyproject.toml`, uv-managed), not in the pnpm
workspace.

Route handler, UI, and `IsochroneProvider` interface are untouched — this is the adapter
swap ADR-0002 was designed for, pointed at our own engine.

## 4. Data pipeline (`tools/graph-pipeline`, Python)

A Python project run locally or in CI whenever map data should refresh
(`uv run build-graph`). Built on the ecosystem where OSM prior art lives:
**pyrosm** (local PBF → walking network), **networkx/OSMnx** (graph simplification and
sanity analysis), **shapely/geopandas** (geometry). No Overpass dependency.

1. **Download** the Geofabrik Israel OSM extract (~100 MB; cached locally; never committed).
2. **Clip** to the Tel Aviv metro bounding box — a tunable constant, roughly
   lon 34.74–34.92, lat 31.98–32.20.
3. **Extract** the walking network via pyrosm's walking profile, tightened by our own
   config: include footway, path, pedestrian, residential, living_street, steps, service
   and minor roads; exclude motorway/trunk, `foot=no`, `access=private`.
4. **Build the graph**: nodes at intersections and way endpoints; edges carry length,
   walk-time (5 km/h default, slower on steps), and real street geometry (kept for
   polygon accuracy). Simplify degree-2 chains into single edges.
5. **Emit** one versioned binary asset (typed arrays: node coordinates, CSR adjacency,
   edge geometry), expected 2–5 MB, **committed to the repo** so deploys are reproducible
   without re-running the pipeline. The format is documented in a reference doc and is
   the language-neutral contract with the TS engine.

The walkability profile is a config object (speeds + tag filters). Cycling later = a
second profile emitting a second asset; no pipeline redesign. Being offline-only, the
Python toolchain never affects the deployed app; CI runs it only to validate, not to
deploy.

## 5. Graph asset format & `GraphSource`

The binary asset starts with a versioned header. `GraphAssetMeta` travels with the bytes:
format version, OSM snapshot date, region bbox, profile id, build timestamp. An
engine/asset format mismatch fails loudly at load.

The engine never knows where graph bytes come from:

```ts
interface GraphSource {
  readonly name: string; // 'bundled', 'remote', ...
  load(profile: ProfileId): Promise<{ buffer: ArrayBuffer; meta: GraphAssetMeta }>;
}
```

- **MVP adapter — `BundledGraphSource`:** reads the asset shipped inside the deployment.
- **Future adapters (designed-for, not built):** `RemoteGraphSource` fetching from a URL
  with ETag/version caching, enabling a CI cron to rebuild weekly from fresh OSM and
  publish (GitHub Releases / R2 free tier / any static host) — deployed lambdas pick up
  new data without a redeploy. The same seam could later serve region tiles.

Caching policy (module-level cache keyed by asset version) lives inside each source
adapter. Swapping data infra later touches nothing outside `GraphSource` adapters.

Placement: the `GraphSource` **interface** is defined in `packages/engine` (pure TS);
**concrete adapters** that touch I/O (`BundledGraphSource` reading a deployed file,
future `RemoteGraphSource` fetching) live server-side in `packages/providers`, keeping
the engine environment-agnostic.

## 6. Runtime engine (`packages/engine`)

Pure TypeScript, zero Node-specific APIs — the graph arrives as an `ArrayBuffer`, so the
same code can later run in a browser Web Worker (browser-computed isochrones stay open as
a cheap follow-up).

```ts
loadGraph(buffer: ArrayBuffer): WalkGraph;          // parse + spatial index, once
computeIsochrone(graph: WalkGraph, origin: LngLat, minutes: number): Polygon | MultiPolygon;
```

1. **Snap.** A grid spatial index (built at load) finds the nearest walkable edge within
   ~250 m; origin snaps to the closest point on it. Nothing in range →
   `OutOfCoverageError`.
2. **Search.** Dijkstra from the snapped point over walk-time weights with a binary
   min-heap, stopping at the minutes cutoff. Result: all reached nodes plus **partial
   edges** on the frontier — interpolated along real edge geometry so the isochrone
   boundary is honest. Scale: ~100k nodes metro-wide; a 30-min cutoff touches a fraction;
   milliseconds per query, well inside the 1.5 s P50 budget.
3. **Polygonize.** Following production-engine prior art (Valhalla) rather than alpha
   shapes: reached nodes + sampled edge geometry + frontier tips are rasterized onto a
   small travel-time grid (~50–100 m cells over the query's bounding area), which is
   contoured at the minutes cutoff with **marching squares** (turf's isobands or a small
   own implementation), then simplified and lightly smoothed. Robust (no degenerate-hull
   cases), deterministic, and naturally yields MultiPolygons with holes for unreachable
   pockets. The polygonizer is an isolated module with a clean contract; a concave-hull
   strategy can be swapped in for comparison without touching search.

**Serverless loading:** first request on a fresh lambda parses the asset (tens of ms) and
caches the `WalkGraph` at module level; subsequent requests reuse it.

## 7. Provider integration

`LocalIsochroneProvider` ('local') in `packages/providers`: validates with the existing
Zod schema, calls the engine, wraps the polygon with metadata (`engine: 'local'`, engine
version, graph build date — staleness is always visible). `ISOCHRONE_PROVIDER=local|ors`
selects the adapter in the route handler; `local` becomes the default after validation.
Optional `ISOCHRONE_FALLBACK=ors` falls back to ORS on any engine error.

## 8. Error handling

| Condition | Behavior |
| --- | --- |
| Origin outside coverage / unsnappable | `OutOfCoverageError` → HTTP 422, clear message; existing FR-9 toast |
| Polygonizer degraded (e.g. empty contour at tiny time bands → falls back to a minimal buffer around the origin) | HTTP 200, flagged in metadata |
| Asset unreadable / format mismatch | Loud load failure with clear log; optional ORS fallback |
| Invalid request | Existing Zod 400 path, unchanged |

## 9. Testing

- **Engine units:** hand-built toy graphs with known shortest-path answers — Dijkstra
  distances, cutoff behavior, partial-edge interpolation, snapping (incl. out-of-range),
  deterministic output.
- **Polygon properties:** valid topology; contains origin; nesting (5-min ⊆ 10-min ⊆ …,
  small tolerance).
- **Pipeline (pytest):** runs on a tiny checked-in OSM fixture (a few blocks); asserts
  node/edge counts, walkability filtering, and a header snapshot.
- **Cross-language contract:** a small fixture asset built by the Python pipeline is
  checked in; a TS engine test loads it and asserts structure + a known shortest path —
  guarding the binary format across both languages.
- **Reality check vs ORS:** dev script comparing polygons for ~10 origins × 3 time bands
  by intersection-over-union; target IoU ≥ ~0.75 (gross-disagreement detector, not exact
  match — data snapshots and speed models differ). Results recorded in the ADR.
- **Perf guard:** 30-min isochrone computes in < ~200 ms on the real asset.
- Existing Playwright smoke unchanged — it only asserts a polygon renders.

## 10. Rollout

1. Pipeline + committed asset land first.
2. `local` adapter ships behind `ISOCHRONE_PROVIDER` (ORS still default).
3. Run the ORS validation script; record results.
4. Flip default to `local`; ORS key becomes optional in `.env.example`.
5. **ADR-0007** records the decision (supersedes ADR-0002's MVP section); PRD
   architecture diagram updated.

## 11. Explicit non-goals (this leap)

- Transit or cycling computation (designed-for follow-ups only).
- Remote/live graph data source (interface exists; only `BundledGraphSource` is built).
- Browser-side computation (kept possible by the pure-TS engine, not built).
- Any paid infrastructure.
- **UI/UX elevation.** The current UI is acknowledged prototype-grade; raising it to
  product quality is a separate, planned follow-up round. This leap deliberately keeps
  the UI contract frozen (same polygon GeoJSON in, same rendering) so the engine swap
  and the UI round stay independent.
