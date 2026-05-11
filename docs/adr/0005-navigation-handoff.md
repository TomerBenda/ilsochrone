# ADR-0005: Navigation handoff via per-provider deep links

- Status: Accepted
- Date: 2026-05-11
- Deciders: Tomer

## Context

Ilsochrone tells you where you can get. Once a user picks a destination — by clicking the map, tapping a POI marker, or hitting "Surprise me" — they should be one click away from turn-by-turn directions in their preferred app: Google Maps for general routing, Waze for driving, Moovit for transit (especially in Israel), Apple Maps on iOS.

There is no single web-standard "open in maps" interface:

- `geo:<lat>,<lng>?q=...` URIs work on Android only; iOS and desktop browsers ignore them or surface them poorly.
- The Web Share API (`navigator.share`) shares a URL or text — there's no "navigate to this location" intent.
- App-specific URL schemes (`comgooglemaps://`, `waze://`, `moovit://`) work only if the app is installed, with no fallback.

Most map-handoff patterns in the wild — Citymapper, transit-portal apps, hotel websites — use an explicit small menu of per-provider links. Each provider has a universal HTTPS link that opens the native app via OS-level link handling when installed, and falls back to a web tab otherwise.

## Decision

Ship a `NavigateTo` component that renders a row of provider buttons for a given destination. Buttons in order, all phase-1: Google Maps, Waze, Moovit, Apple Maps, OpenStreetMap, and a "Copy coords" action.

URL builders live in `apps/web/src/lib/navigation-links.ts` as pure functions. Each builder is independently testable. Travel-mode hints are best-effort and only applied to providers that document them (Google, Apple). Waze is always car-mode by definition; Moovit is always transit.

The component is consumed by a `DestinationCard` wrapper that includes a title, subtitle, and close button. The card is the canonical "destination action" affordance, reused by:

- Map-click destination popup (this PR)
- POI marker click (T-09)
- "Surprise me" reveal (T-11)

## Why this and not alternatives

- **Web Share API** — wrong primitive. It can share a URL, not say "navigate to here."
- **`geo:` URI** — Android-only. We'd still need a fallback row for iOS/desktop, so we'd build this anyway.
- **One unified link service (link.uri / map.link)** — adds a third-party redirect, latency, tracking concerns, and a single point of failure.
- **Native app schemes only** — fails when the app isn't installed and gives no fallback.

## Consequences

- Each provider's link format is a small piece of fragile knowledge. We isolate that in one file (`navigation-links.ts`), test it, and treat it as something to revisit annually.
- The card UI is opinionated and the same across destination types. Consistency over flexibility is the right trade-off in an MVP.
- "Moovit" being prominently featured is intentional: it's the dominant transit app in Israel, and ilsochrone's product mission is to push transit use.
- Travel-mode hints aren't perfectly portable across providers; the UI doesn't promise they will be honored, just that they'll be passed.
