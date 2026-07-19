# ADR-0007: Self-maintained isochrone engine (supersedes ADR-0002's MVP section)

- Status: Accepted
- Date: 2026-07-19
- Deciders: Tomer
- Design doc: `docs/superpowers/specs/2026-07-18-self-maintained-isochrone-engine-design.md`

## Context

ADR-0002 chose the OpenRouteService hosted free tier for MVP walking isochrones.
That made the product's core feature depend on a third-party API: rate limits
(500/day, 20/min), an API key, network latency, and someone else's data
snapshot. As the first step in graduating the prototype to a real product, we
want the core computation owned by this repo — at zero monthly cost.

Two research rounds (2026-07-18, recorded in the design doc) found no adoptable
serverless-native engine: Valhalla/OSRM/GraphHopper/OTP are C++/Java servers,
JS pathfinding libraries do point-to-point only, and the closest Rust crate is
early-stage. The mature building blocks (OSM parsing, graph algorithms,
geometry) exist — so we own the core and lean on libraries for commodity parts.

## Decision

Own the isochrone computation end to end, split at a language-neutral binary
contract:

- **`tools/graph-pipeline`** (Python, uv-managed, never deployed): Geofabrik
  Israel extract → pyosmium extraction of the walkable network → OSMnx
  degree-2 chain simplification (`edge_attrs_differ=["highway"]` keeps
  per-edge speed uniform) → largest connected component → versioned binary
  asset (`docs/reference/graph-asset-format.md`), committed to the repo at
  `apps/web/assets/graphs/walk-tlv.v1.bin` so deploys are reproducible.
  - Deviation from the design doc: **pyrosm is uninstallable on Windows**
    (its hard dependency `cykhash` ships source-only and needs MSVC), so the
    doc's named fallback — a hand-rolled pyosmium extractor (~90 lines) — is
    the implementation. Same output shapes, one fewer heavyweight dependency.
- **`packages/engine`** (pure TypeScript, no Node APIs): parses the asset from
  an `ArrayBuffer`, snaps the origin to the nearest walkable edge (grid
  spatial index, 250 m limit), runs cutoff Dijkstra over walk-time weights
  seeded proportionally along the snapped edge, and polygonizes
  Valhalla-style: samples along reached edge geometry (honest partial-edge
  frontiers) are rasterized onto a 60 m travel-time grid, contoured with
  marching squares (`d3-contour`), and lightly simplified. Degenerate results
  fall back to a minimal buffer around the origin, flagged as degraded.
- **`packages/providers`**: `LocalIsochroneProvider` ('local') behind the
  unchanged `IsochroneProvider` seam, plus `BundledGraphSource` (the only
  built `GraphSource` adapter). Both are exported ONLY from the
  `@ilsochrone/providers/server` subpath so the client bundle never sees
  `node:fs`. Metadata now carries `engine: { version, profile, graphBuiltAt,
  osmSnapshot }` — staleness is always visible.
- **Route handler**: `ISOCHRONE_PROVIDER=local|ors` selects the adapter
  (default `local`); optional `ISOCHRONE_FALLBACK=ors` falls back to ORS on
  unexpected engine errors. Out-of-coverage is HTTP 422, never a fallback.
  The ORS adapter is retained for comparison and as the fallback.

## Validation (2026-07-19)

- Real asset: **83,012 nodes / 119,934 undirected edges / 296,442 geometry
  points, 5.21 MB**, OSM snapshot 2026-07-19, bbox (34.74, 31.98) – (34.92, 32.20).
- Perf guard: warm 30-minute isochrone computes in **~42 ms** on the real
  asset (budget < 200 ms; P50 request budget is 1.5 s).
- Cross-language contract: a fixture asset built by the Python pipeline is
  loaded by the TS engine in CI; known shortest-path times reproduce within
  tolerance.
- ORS reality check: IoU over 10 origins × 3 time bands = **mean 0.825**
  (min 0.704, max 0.954) — above the ≥0.75 gross-disagreement threshold; the
  default provider was flipped to `local` on the strength of this run. Full
  table: `docs/research/02-local-vs-ors-iou.md`.

## Consequences

- The core feature has **no external runtime dependency, no rate limits, and
  no API keys**. ORS_API_KEY becomes optional.
- We own correctness and data freshness. Refreshing map data = re-running
  `uv run build-graph` and committing the asset; a weekly CI rebuild via a
  future `RemoteGraphSource` (URL + ETag) is designed-for but not built.
- Cycling later = a second pipeline profile emitting a second asset; transit
  remains the phase-2 OTP question (unchanged from ADR-0002's phase-2 half,
  which this ADR does not supersede).
- Browser-side computation stays open: the engine is pure TS over an
  `ArrayBuffer` and could run in a Web Worker.
- The binary format v1 is a contract: Python writer, TS reader, TS test
  writer, and committed fixtures must change together
  (`docs/reference/graph-asset-format.md`).
