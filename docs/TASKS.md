# Ilsochrone — Sprint Plan

_2-week sprint to deployable walking-isochrone MVP. Each task is a self-contained prompt for an agentic loop: goal, files, definition of done._

Conventions:
- Each task lives on its own branch and ships as a PR with reviewer-subagent comments.
- Tasks are ordered by dependency. Strict left-to-right; parallelism is noted where it's safe.
- A task is "done" only when CI is green on the PR and the listed acceptance bullets pass.

---

## Week 1 — foundations and walking isochrone

### T-01 · Scaffold monorepo
- **Goal.** Empty Turborepo with `apps/web` (Next.js 14 App Router, TS strict, Tailwind, shadcn/ui) and `packages/providers` (TS package, no runtime deps yet).
- **Files.** Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `apps/web/*`, `packages/providers/*`.
- **DoD.** `pnpm dev` boots the app at `localhost:3000` and renders a placeholder. `pnpm typecheck` and `pnpm lint` pass. README has setup steps.

### T-02 · CI + Vercel preview wiring
- **Goal.** GitHub Actions workflow runs lint, typecheck, vitest. Vercel project linked; PR deploys preview URLs.
- **Files.** `.github/workflows/ci.yml`, `vercel.json` if needed, `.env.example`.
- **DoD.** A throwaway PR shows a green CI run and a Vercel preview comment.

### T-03 · Provider interfaces
- **Goal.** Define `IsochroneProvider`, `PoiProvider`, `TileProvider`, `TransitDataProvider` interfaces with Zod schemas for inputs/outputs.
- **Files.** `packages/providers/src/{isochrone,poi,tile,transit}/types.ts`.
- **DoD.** All four interfaces compile, are exported from the package root, and have a fixture-fed in-memory `Fake*Provider` used in tests.

### T-04 · ORS isochrone adapter
- **Goal.** Implement `OrsIsochroneProvider` against the ORS isochrones endpoint. Server-side only; never imported into client components.
- **Files.** `packages/providers/src/isochrone/ors.ts`, fixture in `__fixtures__/ors-walking-15min.json`, vitest spec.
- **DoD.** Unit tests pass against the fixture without making real network calls. A small contract test asserts the polygon is valid GeoJSON. README shows how to set `ORS_API_KEY`.

### T-05 · Stadia tile adapter and MapLibre map
- **Goal.** `StadiaTileProvider` returning a MapLibre style URL; `<IlsochroneMap>` component using `react-map-gl/maplibre` rendering Tel Aviv.
- **Files.** `packages/providers/src/tile/stadia.ts`, `apps/web/src/components/map/*`, `apps/web/src/app/page.tsx`.
- **DoD.** `/` renders a working map of Tel Aviv with attribution. Tile theme switches with system color scheme. Lighthouse perf > 80 on desktop.

### T-06 · Origin pin + geolocation
- **Goal.** Draggable marker for origin. On load, request geolocation; fallback to Tel Aviv center (32.0853, 34.7818).
- **Files.** `apps/web/src/components/map/OriginPin.tsx`, `apps/web/src/lib/geolocation.ts`.
- **DoD.** Marker drag end emits a typed event consumed by a parent. Permission denial is graceful with a toast.

### T-07 · Time selector + isochrone fetch + render
- **Goal.** Time band selector (5/10/15/20/30). On change or pin drag, hit `/api/isochrone` and render the polygon.
- **Files.** `apps/web/src/app/api/isochrone/route.ts`, `apps/web/src/components/controls/TimeSelector.tsx`, `apps/web/src/components/map/IsochroneLayer.tsx`, SWR hook in `apps/web/src/lib/hooks/useIsochrone.ts`.
- **DoD.** Pin drag and time change update the polygon within 2 s P50 in the deployed preview. Route handler caches identical requests for 60 s on the server.

---

## Week 2 — POIs, exploration, polish, ship

### T-08 · Geoapify POI adapter
- **Goal.** `GeoapifyPoiProvider` searching by bbox + categories with internal `PoiCategory` enum normalization.
- **Files.** `packages/providers/src/poi/geoapify.ts`, fixture, vitest spec.
- **DoD.** Fixture-driven tests pass. Categories map correctly to internal enum values. Adapter never returns provider-specific tags.

### T-09 · POI overlay + category toggles
- **Goal.** After isochrone renders, fetch POIs in its bbox, filter inside the polygon client-side (turf.js `booleanPointInPolygon`), render markers, toggleable per category in a sidebar.
- **Files.** `apps/web/src/app/api/pois/route.ts`, `apps/web/src/components/map/PoiLayer.tsx`, `apps/web/src/components/controls/CategoryToggles.tsx`.
- **DoD.** ≤ 200 markers render without jank. Toggling categories updates the layer instantly. POIs outside the polygon are filtered out.

### T-10 · URL state and shareable links
- **Goal.** App state (lng, lat, mode, t, cats, z) lives in the URL. Loading a URL reproduces the view. Updates are debounced.
- **Files.** `apps/web/src/lib/url-state.ts`, integrated with map and controls.
- **DoD.** Round-trip test (Playwright): set state via UI → copy URL → open in new tab → state matches.

### T-11 · "Surprise me"
- **Goal.** Button that picks a random POI inside the current isochrone, animates camera, and shows a card.
- **Files.** `apps/web/src/components/controls/SurpriseMe.tsx`, `apps/web/src/components/map/PoiCard.tsx`.
- **DoD.** Empty-isochrone case shows a friendly empty state. Animation respects `prefers-reduced-motion`.

### T-12 · Attribution, accessibility, mobile pass
- **Goal.** Stadia, MapLibre, OSM, Geoapify, ORS attributions visible. Keyboard nav for all controls. 360 px viewport works.
- **Files.** `apps/web/src/components/map/Attribution.tsx`, audits noted in PR description.
- **DoD.** axe-core on `/` reports zero serious violations. All four attribution links resolve. iPhone SE viewport screenshot looks correct in the PR.

### T-13 · Playwright smoke
- **Goal.** One end-to-end smoke test: load `/`, drop a pin, change time, assert polygon and ≥ 1 POI marker exist.
- **Files.** `apps/web/e2e/smoke.spec.ts`, CI step added to T-02 workflow.
- **DoD.** Smoke passes locally and in CI on a built preview.

### T-14 · Open Graph + README + screenshots
- **Goal.** Static OG image for `/` (Next ImageResponse), production README with the project pitch, screenshots/GIF, and "how to run."
- **Files.** `apps/web/src/app/opengraph-image.tsx`, `README.md`, `docs/screenshots/`.
- **DoD.** OG card validates on opengraph.xyz. README links to the live URL.

### T-16 · POI accuracy phase 1 — Foursquare adapter + CompositePoiProvider
- **Goal.** Land a `FoursquarePoiProvider` in `packages/providers/src/poi/foursquare.ts`. Introduce `CompositePoiProvider` that routes commercial categories (café, restaurant) to Foursquare and geographic categories (park, beach, viewpoint, museum) to Geoapify, per ADR-0006.
- **Files.** `packages/providers/src/poi/{foursquare,composite}.ts`, `packages/providers/src/poi/foursquare.test.ts` (fixture-driven), `apps/web/src/app/api/pois/route.ts` (swap to composite when key present), `apps/web/.env.example` (add `FOURSQUARE_API_KEY`).
- **DoD.** Unit tests cover the routing logic. With `FOURSQUARE_API_KEY` set, café/restaurant markers come from Foursquare; without it, the existing Geoapify-only path still works.
- **Blocked by.** User provisioning a Foursquare developer account.

### T-17 · Suggested-places panel (sortable)
- **Goal.** Side panel listing the visible POIs with sortable columns: rating (Foursquare/Google), distance from origin (computed client-side), category. Selecting a row opens the destination card and flies the camera (reusing the SurpriseMe camera path).
- **Files.** `apps/web/src/components/panels/SuggestedPlaces.tsx`, small distance helper in `apps/web/src/lib/geo.ts`.
- **DoD.** Toggling sort columns reorders the list instantly. Selecting a row updates the map. Works on mobile (panel collapses to a bottom sheet).
- **Blocked by.** T-16 (needs rating data).

### T-15 · Production cutover
- **Goal.** Promote latest preview to production. Tag `v0.1.0`. Post-mortem note: what worked, what didn't, what changed in the PRD.
- **Files.** `CHANGELOG.md`, `docs/postmortem-v0.1.md`.
- **DoD.** Live URL reachable; CHANGELOG has entries; postmortem references at least 3 ADR/PRD diffs that came out of building.

### T-18 · Self-maintained isochrone engine (DONE 2026-07-19)
- **Goal.** Replace the hosted ORS dependency with a repo-owned engine per the 2026-07-18 design doc: Python graph pipeline (`tools/graph-pipeline`, uv-managed) building a committed binary walk-graph asset; pure-TS engine (`packages/engine`) doing snap → cutoff Dijkstra → marching-squares polygonization; `LocalIsochroneProvider` behind the unchanged `IsochroneProvider` seam.
- **Files.** `tools/graph-pipeline/**`, `packages/engine/**`, `packages/providers/src/{server.ts,isochrone/{local,bundled-source}.ts}`, `apps/web/src/lib/server/isochrone-providers.ts`, `apps/web/src/app/api/isochrone/route.ts`, `apps/web/assets/graphs/walk-tlv.v1.bin`, `docs/reference/graph-asset-format.md`, ADR-0007.
- **DoD.** All met: pipeline pytest + engine/provider/web vitest green; cross-language fixture contract test; perf guard (warm 30-min isochrone ~42 ms < 200 ms); ORS IoU validation recorded in `docs/research/02-local-vs-ors-iou.md`; `ISOCHRONE_PROVIDER` selection with 422 out-of-coverage and optional ORS fallback.
