# Ilsochrone — Product Requirements

_Status: Draft 1 · Owner: Tomer · Last updated: 2026-05-08_

## 1. One-line

A web app that shows where you can get to in Tel Aviv in T minutes — by foot today, by bus / train / light rail / bike / car later — and what's worth visiting inside that area.

## 2. Why

Two reasons, in this order:

1. **Encourage public transportation and spontaneous urban exploration.** Most maps answer "how do I get there?" Ilsochrone answers "where can I get?" That reframe is the product.
2. **Be a portfolio-grade, AI-assisted, industry-shaped build** demonstrating spec-driven development, agentic loops, and clean provider abstractions over messy real-world data.

The two goals reinforce each other: the harder the project takes the data seriously, the more interesting "spontaneous exploration" becomes.

## 3. Audience and use cases

- **Primary:** A curious resident or visitor in Tel Aviv with 30 minutes to spare, opens the app, drops a pin where they are, picks "20 minutes by foot," and sees a polygon of reachable streets plus parks/cafes/viewpoints inside it. Optional: hits "Surprise me" and gets a random reachable destination.
- **Secondary (phase 2):** A commuter comparing "what's reachable from this apartment vs that one in 30 minutes by transit," used as a renting/buying decision tool.
- **Tertiary (out of scope for MVP):** Power users sharing curated isochrone snapshots on social media.

## 4. Non-goals (MVP)

- **Turn-by-turn navigation.** This is not a routing app for individual trips.
- **Off-Tel-Aviv coverage.** The app must geographically center on Tel Aviv-Yafo and degrade gracefully outside.
- **User accounts, saved locations, history.** No auth in MVP.
- **Native mobile apps.** Mobile-responsive web only.
- **Real-time vehicle tracking** (Israel has no public GTFS-RT feed today; phase 2 transit isochrones use static schedules).
- **Multi-language UI.** English MVP. Hebrew + RTL support is a follow-up.

## 5. MVP scope (walking only — 2-week sprint)

A user can:

- Open the app and see a Tel Aviv map with their location pinned (with permission), or a default downtown pin if denied.
- Drag the origin pin anywhere within Tel Aviv-Yafo metro area.
- Choose a time band: 5 / 10 / 15 / 20 / 30 minutes.
- See a walking isochrone polygon rendered live on the map. Polygon updates within 2 seconds of pin drop or time change.
- See POI markers (parks, cafes, viewpoints, beaches, museums) inside the polygon, layered and toggleable by category.
- Hit a "Surprise me" button and get a random POI inside the current isochrone, with a flyTo animation and a small card showing its name and OSM details.
- Share the current view via a URL that encodes origin lat/lng, mode, time, enabled POI categories, and zoom — pasting the URL reproduces the exact view.

Explicitly _out_ of MVP: cycling, transit, driving, traffic, multi-origin compare, POI photos, ratings, opening hours.

## 6. Phase 2 scope (illustrative only, not committed)

- Transit isochrones (bus, train, LRT) using Israel MOT GTFS via self-hosted OpenTripPlanner on a small VPS. Static schedules only.
- Driving isochrones with traffic via a hosted API (HERE or Mapbox).
- Cycling isochrones via the same isochrone provider used for walking.
- Bikeshare overlay if Metrofun or a successor publishes GBFS.
- Multi-origin compare ("from home" vs "from office").
- Hebrew UI and RTL layout.

## 7. Functional requirements (MVP)

| ID | Requirement |
|---|---|
| FR-1 | App requests browser geolocation on first load; falls back to a default Tel Aviv center if denied. |
| FR-2 | Origin pin is draggable on the map. Drag end triggers isochrone refresh. |
| FR-3 | Time band selector with values 5/10/15/20/30 min. Change triggers isochrone refresh. |
| FR-4 | Mode selector showing only "Walking" enabled. Other modes visible but disabled with a "phase 2" tooltip. |
| FR-5 | Isochrone request returns a GeoJSON polygon, rendered as a translucent layer with stroke. |
| FR-6 | POI markers are fetched scoped to the polygon's bounding box and filtered to inside the polygon client-side. Categories: park, cafe, viewpoint, beach, museum, restaurant. Toggleable as a layer panel. |
| FR-7 | "Surprise me" picks a uniformly random POI inside the polygon, animates the camera, and shows a card with name, category, and OSM link. |
| FR-8 | URL state: `?lng=X&lat=Y&mode=walk&t=20&cats=park,cafe&z=14`. URL updates on every state change (debounced ~500 ms). Loading the URL reproduces the view. |
| FR-9 | Errors (provider 429, network, no result) show a non-blocking toast with a retry action. |
| FR-10 | All map UI works on a 360 px-wide phone viewport. |
| FR-11 | Any chosen destination (right-click on the map, POI marker click, "Surprise me" pick) exposes a handoff menu with deep links to Google Maps, Waze, Moovit, Apple Maps, OpenStreetMap, and a "Copy coords" action. Each link opens the native app on phones and a web tab on desktop. |
| FR-12 | Destination interactions are isolated from origin movement: drag the origin pin to move origin, right-click anywhere to set a destination, plain click to dismiss any open destination card. |

## 8. Non-functional requirements

- **Performance:** P50 isochrone round-trip ≤ 1.5 s; P95 ≤ 3 s. Map interaction stays at 60 fps with the polygon and ≤ 200 POI markers.
- **Cost:** Zero monthly cost for MVP. Total third-party usage stays inside free tiers given a portfolio-level traffic assumption (≤ 1k isochrone requests/day).
- **Privacy:** No analytics that send PII. No origin coordinate is stored server-side. Geolocation is opt-in.
- **Accessibility:** Keyboard navigable controls; ARIA on the map container; color choices that pass WCAG AA contrast.
- **SEO / shareability:** Open Graph card on `/` showing a static map screenshot.

## 9. Architecture (one-page)

```
┌────────────────────────────────┐
│  Next.js 14 App Router (Vercel)│
│  ├ /  (map page)               │
│  ├ /api/isochrone (route)      │   ← thin proxy + caching
│  ├ /api/pois (route)           │   ← thin proxy + caching
│  └ shared lib/providers/*      │
└──────┬─────────────────────────┘
       │
       ├─► IsochroneProvider  ──► Local engine (default) ──► packages/engine + committed walk-graph asset
       │                       ├─► ORS adapter (fallback/comparison) ──► api.openrouteservice.org
       │                       └─► OTP adapter (phase 2) ──► self-hosted OTP
       │
       ├─► PoiProvider        ──► Geoapify adapter (MVP) ──► api.geoapify.com
       │                       └─► Overpass adapter (escape hatch) ──► overpass.private.coffee
       │
       ├─► TileProvider       ──► Stadia adapter (MVP)
       │                       └─► MapTiler adapter (alt)
       │
       └─► TransitDataProvider (phase 2) ──► MOT GTFS adapter
```

Provider interfaces live in `packages/providers`. Each adapter is independently testable with a fixture-based fake. Route handlers depend on the interface only. The UI never imports an adapter directly.

## 10. Stack

- **Monorepo:** Turborepo, pnpm workspaces.
- **App:** Next.js 14 App Router, TypeScript strict mode, Tailwind, shadcn/ui.
- **Map:** MapLibre GL JS via `react-map-gl/maplibre`.
- **Data fetching:** SWR (client) and Next route handlers (server proxy).
- **Validation:** Zod for provider response schemas and URL params.
- **Lint/format:** ESLint flat config, Prettier, lint-staged + husky on commit.
- **Tests:** Vitest for adapter unit tests with fixtures; one Playwright smoke test that loads `/`, drops a pin, and asserts a polygon renders.
- **CI:** GitHub Actions — typecheck, lint, vitest, Playwright smoke. Vercel preview deploys per PR.
- **Hosting:** Vercel for the app. Provider API keys in Vercel env vars.

## 11. Provider abstraction contract (informal)

```ts
// IsochroneProvider
interface IsochroneRequest { origin: LngLat; mode: TravelMode; minutes: number }
interface IsochroneResult  { polygon: GeoJSONPolygon; metadata: { provider: string; computedAt: string } }
interface IsochroneProvider {
  name: string;
  supports(mode: TravelMode): boolean;
  getIsochrone(req: IsochroneRequest): Promise<IsochroneResult>;
}

// PoiProvider — categories normalized to an internal enum, not the provider's raw tags
interface PoiQuery { bbox: BBox; categories: PoiCategory[]; limit: number }
interface Poi { id: string; name: string; category: PoiCategory; lngLat: LngLat; sourceUrl?: string }
interface PoiProvider {
  name: string;
  searchInBbox(q: PoiQuery): Promise<Poi[]>;
}

// TileProvider — returns a MapLibre style URL (or inline style)
interface TileProvider {
  name: string;
  getStyleUrl(theme: 'light' | 'dark'): string;
  attribution: string;
}

// TransitDataProvider (phase 2) — abstracts how we get GTFS into the routing engine
interface TransitDataProvider {
  name: string;
  pullStaticGtfs(): Promise<{ archivePath: string; validFrom: Date; validTo: Date }>;
  pullRealtime?(): AsyncIterable<GtfsRtMessage>;
}
```

The contract lives in code; this PRD documents the intent. Adapters and tests for the MVP interfaces ship in week 1.

## 12. Risks and open questions

- **R1 (Overpass reliability).** Mitigated by Geoapify-as-primary plus an Overpass adapter pointed at Private.coffee.
- **R2 (Free-tier exhaustion under viral traffic).** Mitigated by aggressive Vercel-level response caching keyed on rounded coordinates + minutes.
- **R3 (No GTFS-RT in Israel).** Phase 2 transit will be schedule-based. Document this honestly in the UI.
- **R4 (Phase-2 hosting cost).** OTP needs a small VPS (~$5/mo). Document this in phase-2 ADR; don't pretend it's free.
- **OQ-1.** Tile provider — Stadia vs MapTiler. Defer to ADR-004 after a vibes test of both styles in Tel Aviv.
- **OQ-2.** POI category taxonomy — initial set is judgment; expand based on Tel Aviv-specific feedback.
