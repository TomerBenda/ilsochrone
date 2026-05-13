# ADR-0006: POI provider strategy — hybrid by category, phased rollout

- Status: Accepted (decision); Implementation deferred until user is ready to provision accounts
- Date: 2026-05-11
- Deciders: Tomer

## Context

ADR-0003 chose **Geoapify Places** (OSM-sourced) as the MVP POI provider. After a week of real-world use, an accuracy gap is visible: the user reports specific Tel Aviv places — cafés, restaurants, small businesses — that exist in the city but are missing from the map. This isn't a Geoapify bug; it's an OSM coverage gap. Commercial venue density on OSM has historically lagged commercial map products (Google, Foursquare, Apple) by years, especially outside major Western European cities.

The user also wants to add a "suggested places" panel sortable by user-configurable parameters (popularity, rating, distance). OSM data does not include rating/popularity signals at scale; commercial APIs do.

## Decision

Adopt a **hybrid POI sourcing strategy**, with implementation phased to track when external accounts are available.

### Category routing

Split categories by where the data lives best:

| Category | Best source | Why |
|---|---|---|
| Park | OSM (Geoapify) | OSM excels at physical geography; parks are well-mapped. |
| Beach | OSM (Geoapify) | Same. |
| Viewpoint | OSM (Geoapify) | Volunteer mappers love viewpoints. |
| Museum | OSM (Geoapify) or commercial | Static, well-known set; either works. |
| Café | Foursquare or Google | Commercial venue churn; OSM gaps are biggest here. |
| Restaurant | Foursquare or Google | Same as café. |

The mapping lives in code as `CATEGORY_TO_PROVIDER`. UI and the rest of the app see one normalized `Poi[]` and don't know which provider produced which marker.

### Architecture

Introduce a `CompositePoiProvider` that wraps multiple sub-providers and routes requests by category:

```ts
class CompositePoiProvider implements PoiProvider {
  constructor(private byCategory: Partial<Record<PoiCategory, PoiProvider>>) {}

  async searchInBbox(q: PoiQuery): Promise<PoiResult> {
    const groups = groupBy(q.categories, (c) => this.byCategory[c]);
    const results = await Promise.all(
      [...groups.entries()].map(([provider, cats]) =>
        provider?.searchInBbox({ ...q, categories: cats }),
      ),
    );
    return mergeResults(results);
  }
}
```

The route handler instantiates this at startup based on env-var configuration. Single-provider deployments (e.g. "Geoapify only") work without `CompositePoiProvider` by passing the single provider directly.

### Provider preference

Among the commercial options, **Foursquare > Google** as the default upgrade for this project:
- 100k req/mo free tier vs. Google's $200/mo credit (~10k Nearby Search calls). Foursquare is 10× cheaper at scale.
- No credit card required for Foursquare's free tier.
- Permissive ToS — fewer restrictions on caching and display than Google.
- Comparable venue data quality in dense urban areas, including Tel Aviv.

Google remains a credible second choice and may eventually be added as a third adapter for direct comparison. Apple Maps Server API is excluded (requires paid Apple Developer Program).

### Phasing

- **Phase 0 (now).** Geoapify only. CompositePoiProvider not yet introduced. Accuracy gap documented; user is informed.
- **Phase 1 (when user provisions Foursquare).** Add `FoursquarePoiProvider`, introduce `CompositePoiProvider`, route commercial categories to Foursquare while keeping geographic categories on Geoapify. Add `FOURSQUARE_API_KEY` to `.env.example`.
- **Phase 2 (optional).** Add `GooglePoiProvider` for comparison. Could be selected per category, or A/B'd against Foursquare via a feature flag.
- **Phase 3 (suggested-places panel).** Build the side panel that lists POIs with sortable columns (rating, distance, category). Rating is sourced from Foursquare/Google; distance is computed client-side from `state.origin`; category is already in the `Poi` shape. The panel reuses the existing `PoiProvider` data path — no new provider work needed.

## Why not just add Foursquare now

The user explicitly opted out of provisioning new external accounts this round. Building a Foursquare adapter without an active Foursquare account means landing untested code in the repo, then either:

- Mocking the upstream and relying on integration tests we don't have, or
- Leaving the code in a "compiles but never ran" state — high risk of subtle bugs when it eventually does run.

Better to write the design now (this ADR + a stub in TASKS.md), and implement when the account is in hand and the integration can be exercised end-to-end.

## Consequences

- Phase 0 ships with a known accuracy gap. The map will under-represent Tel Aviv's commercial venue density. We mitigate by showing the user we know.
- The PRD's POI categories (FR-6) don't change — internal taxonomy is provider-agnostic on purpose.
- Phase 1+ adds attribution requirements: any view that displays Foursquare data must show Foursquare attribution near the marker or in the destination card. ADR-0005's `DestinationCard` is the natural home.
- The CompositePoiProvider pattern is a clean teaching moment for the abstraction: multiple adapters behind one interface, routing by domain key (category) without UI awareness. Worth highlighting in the README screenshots/walkthrough.
- Cost ceilings: even Phase 2 (Google) stays inside Google's $200/mo credit for portfolio-level traffic.

## When this ADR should be reopened

- If Foursquare's free tier changes meaningfully (currently 100k req/mo).
- If OSM coverage in Tel Aviv improves to the point that the gap closes (track via spot checks every few months).
- If the user decides to go all-in on Google Maps for the UI overall (e.g. switching basemap to Google Maps tiles) — at which point a single-provider Google adapter becomes the simpler default.
