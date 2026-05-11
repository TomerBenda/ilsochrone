# ADR-0002: Isochrone engine — OpenRouteService for MVP, OTP-on-VPS for phase 2

- Status: Accepted
- Date: 2026-05-08
- Deciders: Tomer

## Context

We need a way to compute walking isochrones over Tel Aviv on a free hosted budget for MVP, with a credible path to transit (bus, train, LRT) isochrones over Israel MOT GTFS in phase 2. Self-hosting is allowed for phase 2 but ruled out for MVP. Fly.io's free tier no longer exists in 2026, so the previously-assumed free-OTP path is gone.

See `docs/research/01-data-sources.md` for the full survey.

## Decision

- **MVP (walking):** OpenRouteService hosted free tier (500 isochrone requests/day, 20/min) via a Next.js route handler that forwards requests with a server-side API key.
- **Phase 2 (transit):** Self-hosted OpenTripPlanner 2 with Israel MOT static GTFS + OSM extract, deployed to a small VPS (Hetzner CX11 or DigitalOcean droplet, ~$5/mo) or Railway/Render's cheap container tiers. Exposed behind the same `IsochroneProvider` interface as ORS so the UI does not change.
- **Fallback for phase 2 if VPS is rejected:** Evaluate TravelTime's transit-capable free tier (10k req/mo non-commercial). Acknowledge the cap may not fit a portfolio demo with any traction.

## Why ORS and not Mapbox / Geoapify / TravelTime / HERE for MVP

- Mapbox: equally generous, but ties basemap and isochrone vendors together, which we want to avoid for the abstraction goal.
- Geoapify: workable, but its 30-min cap on free isolines is a constraint we'd hit; ORS has no such cap.
- TravelTime: lean free tier, focused on transit (which we don't need yet). Reserve for phase 2 evaluation.
- HERE: less transparent quotas, more lock-in.

## Why OTP for phase 2

OTP is the de-facto standard for transit isochrones over arbitrary GTFS, with active development (v2.9.0 as of March 2026), a clean Java packaging story, and a community track record with national-scale GTFS feeds. Valhalla doesn't do transit isochrones natively. No hosted SaaS supports Israel MOT GTFS as a data source.

## Consequences

- A small monthly cost (~$5) is unavoidable when phase 2 ships. The PRD documents this honestly.
- The `IsochroneProvider` interface must be stable from day 1 — both the ORS adapter and the future OTP adapter will consume it. Any breaking changes ripple through both.
- ORS rate limits (20/min) will need server-side caching keyed on rounded coordinates + minutes to survive even modest portfolio traffic.
