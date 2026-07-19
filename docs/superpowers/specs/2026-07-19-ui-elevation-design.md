# UI Elevation Round — Design

_Status: Approved design · Owner: Tomer · Date: 2026-07-19_
_Revision 2026-07-19-b (owner feedback: "palette doesn't read"): band fills are
graded per band (0.18/0.12/0.08/0.055/0.045, deep core ~0.40 composite) instead
of uniform 0.05; surfaces moved from near-white to warm cream (hsl 33 100%
96.5%); legend swatches recomputed and revalidated (monotonic)._

## 1. Goal

Raise the prototype-grade UI to product quality — the follow-up round the
engine spec (§11, 2026-07-18) deliberately deferred. Scope decided with the
owner: **polish + UX rework within the existing interaction model** (map +
draggable pin + time bands + POI toggles). No blank-slate redesign; the
suggested-places panel (T-17) remains a later, separate round.

**Agreed direction:** warm & playful personality · nested time bands as the
signature visualization · bottom sheet on mobile · light theme now with
dark-ready tokens · one multi-band API response.

**Constraints:**

- Zero monthly cost (fonts self-hosted via `next/font`; the only new runtime
  dependency is `vaul`, MIT).
- The single-polygon `IsochroneProvider` contract stays; all API changes are
  additive and optional.
- Existing accessibility affordances (aria roles on all controls) are kept
  and extended, `prefers-reduced-motion` respected.
- Current known UI defects are fixed in passing: control clipping on desktop
  ("Surprise me"/"30 min" cut off), duplicated attribution line, unusable
  375 px layout.

## 2. Visual language (S1)

- Design tokens as CSS variables in `globals.css` — dark mode becomes a
  cheap later drop-in.
- Warm neutrals (Tailwind stone scale) replace today's blue-grays; a
  **coral-orange accent family** doubles as the band-gradient source.
- **DM Sans** via `next/font` (self-hosted at build time), tabular numerals
  for minute values.
- Rounded-xl cards, pill buttons.
- Motion: 150–250 ms ease-out on chips and band fades; small bounce on pin
  drop; all behind `prefers-reduced-motion`.
- Friendlier microcopy ("Drag me anywhere", "Surprise me ✨").
- Category chips keep semantic hues (parks green, cafés amber, …) but as
  harmonized pastel fills with saturated icons.

## 3. Layout (S2)

**Desktop**

- The three mismatched floating clusters merge into **one top-center control
  bar** (single card): mode icons · time segmented control · category chips ·
  Surprise me. Flex-wrap safe — fixes the current clipping.
- The wordy title card shrinks to a compact logo chip top-left; clicking it
  opens an info popover holding the instructions.
- Bottom-left: **band legend** (gradient bar, 5 → selected minutes).
- Bottom-right: single-line attribution (fixes the duplication).

**Mobile (< 768 px)**

- Map full-bleed behind a **bottom sheet** (`vaul`).
- Peek state: drag handle + time control + mode row. Expanded: adds
  categories, Surprise me, legend.
- Status pill stays bottom-center, errors only.

## 4. Map graphics (S3)

- The flat polygon becomes **nested warm bands** rendered from one
  FeatureCollection: deep amber near the origin fading to pale peach at the
  edge; thin white seams between rings; 2 px warm stroke on the outermost
  ring; the selected band's ring emphasized.
- Cumulative fill opacity ≤ ~0.25 so streets remain readable underneath.
- Origin pin: custom warm droplet, soft pulse on first load, drop-bounce on
  drag end.
- POI dots gain tiny white category glyphs (existing lucide icons) at close
  zoom; plain dots when zoomed out; the selected POI scales up and shows a
  name chip.
- Basemap stays Stadia alidade-smooth.

## 5. Bands API (S4 — additive, no breaking changes)

- **Engine:** new `computeIsochroneBands(graph, origin, bands: number[])` —
  one snap, ONE Dijkstra at `max(bands)`, then polygonize each band from the
  same travel-time array (~70 ms for all five). Returns
  `{ bands: [{ minutes, polygon, degraded }], snapDistanceM }`.
  `computeIsochrone` untouched.
- **Provider:** optional interface method `getIsochroneBands?(req)` with
  `IsochroneBandsRequestSchema = { origin, mode, bands: TimeBandMin[] }`.
  Implemented by `LocalIsochroneProvider` only; metadata (engine version,
  graph date, warnings) rides along unchanged.
- **Route:** `/api/isochrone?...&bands=1` returns a `FeatureCollection` whose
  features carry `properties.minutes`, plus `metadata`. If the active
  provider lacks bands support (e.g. ORS selected), the route degrades to a
  single-feature collection at the requested time.
- **Client:** a `useIsochroneBands` SWR hook always fetches **all five
  bands** per origin/mode. The time selector becomes pure client state —
  changing time is instant (visibility/emphasis toggle, no refetch). Origin
  drag or mode change refetches once. **Degraded mode:** when the response
  carries a single feature (provider without bands support), the hook re-keys
  on the selected time — behavior falls back to today's fetch-per-time-change,
  and the UI renders the one band it gets.
- 422 / error contract unchanged.

## 6. Product states (S5)

- **Loading:** soft pulsing halo around the pin until first bands arrive
  (replaces the text pill for loading).
- **Out of coverage (422):** playful copy — "Outside the map! This demo
  covers the Tel Aviv metro." with a "Take me back" action flying to the
  default origin.
- **Empty POIs:** subtle "no places in range — try more time?" hint;
  Surprise me stays disabled with its existing tooltip.
- **Onboarding:** one-time coach mark near the pin ("Drag me! Right-click
  drops a destination"), dismissed on first interaction, localStorage flag.
- Focus rings visible everywhere; the sheet gets focus management from vaul.

## 7. Components & testing (S6)

New components: `ControlBar`, `MobileSheet`, `BandsLayer` (replaces the
polygon layer), `OriginPin`, `BandLegend`, `InfoPopover`, `CoachMark`.
Restyled: `TimeSelector`, `CategoryToggles`, `SurpriseMe`, `DestinationCard`,
`Status`. Modified: `page.tsx` (bands data + selected-band state),
`IlsochroneMap` (FeatureCollection in), `globals.css` (tokens), `layout.tsx`
(font).

Testing:

- Engine units: `computeIsochroneBands` one-pass results deep-equal per-band
  `computeIsochrone` results; band nesting property.
- Provider + route tests for the bands shape and the ORS degradation path.
- Playwright smoke updated: asserts five band features, **no network request
  on time change**, bottom sheet present at 375 px.
- The `frontend-design` skill guides aesthetic execution at implementation
  time.

## 8. Non-goals (this round)

Dark mode (tokens ready, not shipped) · POI clustering · suggested-places
panel (T-17) · browser-side engine computation · custom basemap style ·
cycling/transit UI enablement.
