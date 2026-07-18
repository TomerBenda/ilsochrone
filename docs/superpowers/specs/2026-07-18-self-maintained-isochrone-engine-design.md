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

## 3. Architecture

```
packages/engine-pipeline   build-time Node script (never deployed)
    OSM extract ──► walkable street graph ──► compact binary asset (2–5 MB)

packages/engine            runtime, pure TypeScript (no Node APIs)
    GraphSource ──► snap origin ──► Dijkstra with cutoff ──► GeoJSON polygon

packages/providers         existing package
    + LocalIsochroneProvider ('local') wrapping the engine
    ORS adapter retained as fallback/comparison behind an env flag
```

Route handler, UI, and `IsochroneProvider` interface are untouched — this is the adapter
swap ADR-0002 was designed for, pointed at our own engine.

## 4. Data pipeline (`packages/engine-pipeline`)

A script run locally or in CI whenever map data should refresh
(`pnpm --filter engine-pipeline build-graph`):

1. **Download** the Geofabrik Israel OSM extract (~100 MB; cached locally; never committed).
2. **Clip** to the Tel Aviv metro bounding box — a tunable constant, roughly
   lon 34.74–34.92, lat 31.98–32.20.
3. **Filter** ways by a walkability profile: footway, path, pedestrian, residential,
   living_street, steps, service and minor roads; exclude motorway/trunk, `foot=no`,
   `access=private`. A library handles PBF parsing; profile logic is ours.
4. **Build the graph**: nodes at intersections and way endpoints; edges carry length,
   walk-time (5 km/h default, slower on steps), and real street geometry (kept for
   polygon accuracy).
5. **Emit** one versioned binary asset (typed arrays: node coordinates, CSR adjacency,
   edge geometry), expected 2–5 MB, **committed to the repo** so deploys are reproducible
   without re-running the pipeline.

The walkability profile is a config object (speeds + tag filters). Cycling later = a
second profile emitting a second asset; no pipeline redesign.

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
3. **Polygonize.** Reached nodes + sampled edge geometry + frontier tips form a point
   cloud; a concave hull (turf, tuned tightness) traces the outline; a buffer-out/in pass
   smooths spikes. Degenerate hull → looser fallback hull, flagged in metadata. The
   polygonizer is an isolated module with a clean contract so the strategy can be swapped
   (e.g. edge-buffer unions) without touching search.

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
| Polygonizer degraded to fallback hull | HTTP 200, flagged in metadata |
| Asset unreadable / format mismatch | Loud load failure with clear log; optional ORS fallback |
| Invalid request | Existing Zod 400 path, unchanged |

## 9. Testing

- **Engine units:** hand-built toy graphs with known shortest-path answers — Dijkstra
  distances, cutoff behavior, partial-edge interpolation, snapping (incl. out-of-range),
  deterministic output.
- **Polygon properties:** valid topology; contains origin; nesting (5-min ⊆ 10-min ⊆ …,
  small tolerance).
- **Pipeline:** runs on a tiny checked-in OSM fixture (a few blocks); asserts node/edge
  counts and a header snapshot.
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
