# Ilsochrone — Data Sources & Free APIs

_Research note · 2026-05-08 · informs ADR-002 (isochrone engine) and ADR-004 (basemap)._

This is a pragmatic survey of free data sources and APIs for a Tel Aviv isochrone app. MVP is walking-only on Vercel-hosted Next.js + MapLibre; phase 2 adds buses, trains, light rail, bikeshare, and driving. Hard constraint: avoid self-hosting unless no free hosted option exists.

## 1. Israel MOT GTFS

Active and maintained. Static GTFS published by Israel's Ministry of Transport, ~60 days of forward-planned schedules.

- Primary source: <https://gtfs.mot.gov.il/>
- Aggregator mirrors: Transitland, OpenMobilityData/MobilityDatabase
- Format: standard GTFS, refreshed regularly, suitable for production transit apps
- License: government open data (verify terms on the MOT site before use)
- **GTFS-Realtime: not publicly available.** No vehicle positions or trip updates feed. This caps how "live" phase 2 transit isochrones can be without third-party scraping.

## 2. Tel Aviv Bikeshare / Micromobility

- Tel-O-Fun shut down in 2020.
- Current operator: **Metrofun** (<https://metrofun.co.il/en/>).
- 2026: Tel Aviv municipality is running a tender for up to six micromobility operators across bikes and e-scooters.
- **GBFS feed status: unconfirmed.** Modern share systems publish GBFS by convention, but no Tel Aviv operator is verified live in the public GBFS catalog yet. Treat phase-2 bikeshare as "spike when we get there."

## 3. Free Isochrone APIs (Walking)

| Provider | Free Tier | Auth | Notes |
|---|---|---|---|
| **OpenRouteService** | 500/day, 20/min (uncapped for academic / humanitarian) | API key | Generous, simple, OSM-based, walking profile is solid. **Recommended.** |
| Mapbox Isochrone | 100k req/month | API key | Excellent if you already use Mapbox basemaps. Attribution required. |
| Geoapify Isoline | 90k credits/mo, 5 req/s | API key | Up to 30 min isochrone on free tier. |
| TravelTime | 10k/mo non-commercial | API key | Supports transit (paid plans). Lean for MVP, revisit for phase 2. |
| HERE Isochrone | 50k tile + 2.5k non-tile/day | API key | Workable but less transparent pricing/coverage. |
| Valhalla demo (FOSSGIS) | Fair-use, rate-limited | None | Useful fallback / testing only. |
| GraphHopper | 15k credits/day | API key | Credit-shared across endpoints; tighter than ORS. |

## 4. Transit Isochrones for Israel

None of the major hosted free APIs natively use Israel MOT GTFS for transit isochrones. TravelTime supports transit globally but only on paid tiers (~$200/mo). Iso4App and Geoapify CommuteTimeMap have inconsistent Israel coverage.

**Phase-2 path: self-host OpenTripPlanner 2** with Israel MOT GTFS + OSM extract.

- Fly.io's free tier is gone as of 2024 — **scratch that as a free option.**
- Realistic free/cheap hosts (May 2026): Railway and Render free tiers exist but are container-time-limited; a $4–6/mo VPS (Hetzner CX11, DigitalOcean droplet) is the practical answer.
- OTP is resource-heavy (~2–4 GB RAM for an Israel-sized graph). A small VPS handles it; serverless does not.

Architectural implication: keep the routing layer abstracted behind a single `IsochroneProvider` interface so swapping ORS → OTP in phase 2 is one adapter swap.

## 5. Free Basemap & Tile Providers (MapLibre)

- **Stadia Maps** — 2,500 free credits/mo, no card required, good Israel coverage. **Recommended for MVP.** Attribution required.
- **MapTiler** — 100k tile requests/mo, full vector tiles, excellent style ecosystem.
- **Protomaps PMTiles** — single-file format on Cloudflare R2; cheap-to-free at hobby scale, requires a build/upload step. Best long-term cost path.
- **OSM raster tiles (tile.openstreetmap.org)** — allowed for low-volume hobby viewing only. No preloading, no offline. Fine as a dev fallback, not a deploy target.

## 6. POI Data

The original plan was Overpass API only. After review, **Overpass is not dependable enough for a hosted app in 2026** — see "Overpass status caveat" below. POI is therefore treated as a swappable provider with two adapters:

- **Geoapify Places API** (primary) — OSM-sourced, 800+ categories, free tier without a credit card, ~3k requests/day on free. Single account also covers isochrones if we ever want to consolidate.
- **Overpass** (fallback / power-user queries) — pointed at the **Private.coffee mirror** (`overpass.private.coffee/api/interpreter`) by default, never `overpass-api.de` directly. Adapter exposes raw query support for arbitrary OSM tags Geoapify can't express.

### Overpass status caveat (May 2026)

The community-run `overpass-api.de` has been timing out under sustained scraper abuse from cloud IPs since at least April 2026. OSM forum threads openly debate whether to deprecate it. Mirrors (Private.coffee, kumi.systems) remain healthy but are also community-funded fair-use endpoints. Direct production reliance on Overpass for an always-on app is not advised; treat it as a developer convenience, not infrastructure.

## 7. Recommendation

**Walking MVP (now):**
- Isochrone engine: **OpenRouteService**
- Basemap: **Stadia Maps** + MapLibre GL JS
- POIs: **Geoapify Places**, with an Overpass (Private.coffee mirror) adapter behind the same interface for raw-query escape hatches
- Architecture: four provider interfaces — `IsochroneProvider`, `PoiProvider`, `TileProvider`, and (phase-2) `TransitDataProvider` — each with at least one MVP adapter and a clear contract. No provider-specific types leak into UI components.

**Phase 2 (transit):**
- Add an OTP adapter behind the same interface
- Deploy OTP container to Railway or a $5/mo VPS (Hetzner / DigitalOcean)
- Static-only transit (no GTFS-RT in Israel today); revisit if MOT publishes one

**Phase 2 (bikeshare/scooter):**
- Spike on Metrofun GBFS availability when we get there; if no GBFS, scrape sparingly with caching

**Avoid:**
- Fly.io as a free option (no longer free)
- Vercel-only serverless for transit routing (OTP needs persistent memory)
- OSM tiles in production deploys

## Sources

OpenRouteService restrictions, Mapbox Isochrone API docs, Geoapify pricing & isoline docs, TravelTime docs, HERE isoline guide, Valhalla FOSSGIS demo, OpenTripPlanner 2 docs and GitHub releases, Fly.io pricing 2026, Stadia Maps pricing, MapTiler pricing, OpenMapTiles, Protomaps deployment guide, OSM tile usage policy, Overpass API documentation and OSM wiki, Israel MOT GTFS via Transitland and OpenMobilityData, Metrofun, GBFS specification.
