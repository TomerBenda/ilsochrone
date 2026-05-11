# ADR-0003: POI and tile providers — Geoapify Places + Stadia Maps, with adapters

- Status: Accepted
- Date: 2026-05-08
- Deciders: Tomer

## Context

The MVP needs two more external services beyond the isochrone engine: a way to fetch points of interest inside the polygon, and a map basemap. Both should be swappable via interfaces (`PoiProvider`, `TileProvider`) so we can substitute providers without touching UI components, and so the abstraction discipline is consistent across the app.

The original plan listed Overpass as the POI source. After verification (May 2026), the public Overpass instance (`overpass-api.de`) is unreliable: sustained timeouts since at least April 2026 due to scraper abuse, with public OSM-community discussion about its viability. Mirrors (Private.coffee, kumi.systems) remain healthy but are community-funded fair-use endpoints, inappropriate as primary infrastructure for a hosted app.

## Decision

### POI

- **Primary adapter:** Geoapify Places API. Free tier without a credit card; OSM-sourced; 800+ category taxonomy; predictable rate limits.
- **Secondary adapter:** Overpass, configured to point at the **Private.coffee mirror** (`https://overpass.private.coffee/api/interpreter`), used for ad-hoc raw-tag queries that Geoapify's category model can't express. Not used for default app traffic.
- **Internal taxonomy:** Adapters normalize results to an internal `PoiCategory` enum (park, cafe, viewpoint, beach, museum, restaurant for MVP). Provider-specific tags do not leak past the adapter boundary.

### Tiles

- **Primary adapter:** Stadia Maps. 2,500 free credits/month, no credit card, decent Israel coverage, MapLibre-compatible style URLs.
- **Secondary adapter:** MapTiler. Comparable free tier, broader style catalogue. Wired but unused by default; selectable via env var.
- **Style themes:** Light and dark variants for both adapters. The app picks based on system preference.

## Consequences

- We're trading "fully open" (Overpass) for "reliable" (Geoapify). The Overpass escape hatch keeps us honest if a category Geoapify can't express becomes important.
- Two tile providers behind a `TileProvider` interface adds complexity that's mostly cosmetic for MVP — but it's the cheapest place to practice the abstraction pattern that pays off when the isochrone provider swap happens in phase 2.
- Attribution requirements for Stadia, MapTiler, OSM, and Geoapify all need to be rendered correctly in the map UI. This is non-negotiable for license compliance.
