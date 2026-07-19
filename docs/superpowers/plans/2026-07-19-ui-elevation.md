# UI Elevation Round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the prototype UI to product quality per `docs/superpowers/specs/2026-07-19-ui-elevation-design.md`: warm & playful visual language, one unified control bar (desktop) + vaul bottom sheet (mobile), nested time-band isochrones served by one multi-band API response, and real product states.

**Architecture:** Additive bands API flows engine → provider (optional interface method) → route (`bands=1` → FeatureCollection) → `useIsochroneBands` SWR hook fetching all five bands once per origin/mode; the time selector becomes pure client state toggling MapLibre layer visibility. Visual language lives as CSS variables + Tailwind tokens; components are restyled in place.

**Tech Stack:** Existing Next 14 / react-map-gl / Tailwind stack; new deps: `vaul` (MIT bottom sheet), `next/font` DM Sans. No other additions.

## Global Constraints

- Zero monthly cost; fonts self-hosted via `next/font`; only new runtime dep is `vaul`.
- The single-polygon `IsochroneProvider` contract stays; ALL API changes are additive and optional (`getIsochroneBands?`).
- Existing aria roles kept; `prefers-reduced-motion` respected on every new animation.
- Fix in passing: desktop control clipping, duplicated attribution, unusable 375 px layout.
- Light theme only; every color goes through CSS variables so dark mode is a later drop-in.
- **Pinned palette (validated 2026-07-19, sequential/monotonic):** band fill `#F97316` at `fill-opacity: 0.05` per layer (cumulative 0.25 at the 5-min core); seams white 1 px @ 0.9; outermost/selected ring `#C2410C`; legend swatches (composites, 5→30 min): `#F4D1B9 #F3D7C4 #F3DDCE #F3E4D9 #F2EAE4`. Primary action fill `#C2410C` (orange-700, 4.8:1 on white), hover `#EA580C`.
- Branch: `feat/ui-elevation` off `main`. TDD; commit per task.
- Before the first styling task, load the `frontend-design` skill to guide aesthetic execution (spec §7).

## File Structure

```
apps/web/src/app/globals.css                 tokens (warm palette, band vars, radii)
apps/web/tailwind.config.ts                  primary/font tokens
apps/web/src/app/layout.tsx                  DM Sans via next/font
packages/engine/src/isochrone.ts             + computeIsochroneBands
packages/providers/src/isochrone/types.ts    + bands schema/result/FC types, optional method
packages/providers/src/isochrone/local.ts    + getIsochroneBands
apps/web/src/app/api/isochrone/route.ts      + bands=1 branch with degradation
apps/web/src/lib/hooks/useIsochroneBands.ts  NEW hook (all-bands fetch, degraded re-key)
apps/web/src/components/map/IlsochroneMap.tsx   FeatureCollection in, band layers, pin restyle, attribution fix
apps/web/src/components/legend/BandLegend.tsx   NEW
apps/web/src/components/controls/ControlBar.tsx NEW composition (desktop)
apps/web/src/components/controls/{TimeSelector,ModeSelector,CategoryToggles,SurpriseMe}.tsx  restyle
apps/web/src/components/brand/LogoChip.tsx      NEW (logo + info popover, replaces title card)
apps/web/src/components/sheet/MobileSheet.tsx   NEW (vaul)
apps/web/src/components/onboarding/CoachMark.tsx NEW
apps/web/src/components/destination/{DestinationCard,NavigateTo}.tsx  restyle
apps/web/src/app/page.tsx                    bands wiring, states, layout composition
apps/web/e2e/smoke.spec.ts                   bands + no-refetch + sheet assertions
docs/TASKS.md                                T-19 entry
```

---

### Task U0: Branch

- [ ] `git checkout -b feat/ui-elevation`

### Task U1: Engine — `computeIsochroneBands`

**Files:** Modify `packages/engine/src/isochrone.ts`, `packages/engine/src/index.ts`, `packages/engine/src/types.ts`; Test `packages/engine/src/__tests__/bands.test.ts` (new).

**Interfaces produced:**
```ts
export interface IsochroneBand { minutes: number; polygon: Polygon | MultiPolygon; degraded: boolean; }
export interface IsochroneBandsComputation { bands: IsochroneBand[]; snapDistanceM: number; }
computeIsochroneBands(graph: WalkGraph, origin: LngLat, bandsMinutes: number[]): IsochroneBandsComputation
```

- [ ] **Step 1: failing test** `src/__tests__/bands.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadGraph } from '../graph';
import { computeIsochrone } from '../isochrone';
import { computeIsochroneBands } from '../isochrone';
import { OutOfCoverageError } from '../errors';
import { buildAsset } from './helpers/build-asset';

const nodes: [number, number][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) nodes.push([34.78 + c * 0.0021, 32.08 + r * 0.0018]);
const edges: { a: number; b: number; timeS: number }[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    if (c < 2) edges.push({ a: i, b: i + 1, timeS: 144 });
    if (r < 2) edges.push({ a: i, b: i + 3, timeS: 144 });
  }
const GRID = loadGraph(buildAsset({ nodes, edges }));
const CENTER: [number, number] = [34.7821, 32.0818];

describe('computeIsochroneBands', () => {
  it('one pass equals per-band computeIsochrone results', () => {
    const { bands, snapDistanceM } = computeIsochroneBands(GRID, CENTER, [5, 10, 15]);
    expect(bands.map((b) => b.minutes)).toEqual([5, 10, 15]);
    expect(snapDistanceM).toBeLessThan(10);
    for (const band of bands) {
      const solo = computeIsochrone(GRID, CENTER, band.minutes);
      expect(band.polygon).toEqual(solo.polygon);
      expect(band.degraded).toBe(solo.degraded);
    }
  });

  it('sorts unsorted input ascending', () => {
    const { bands } = computeIsochroneBands(GRID, CENTER, [15, 5, 10]);
    expect(bands.map((b) => b.minutes)).toEqual([5, 10, 15]);
  });

  it('rejects empty/invalid bands', () => {
    expect(() => computeIsochroneBands(GRID, CENTER, [])).toThrow(RangeError);
    expect(() => computeIsochroneBands(GRID, CENTER, [0, 5])).toThrow(RangeError);
  });

  it('throws OutOfCoverageError off-network', () => {
    expect(() => computeIsochroneBands(GRID, [34.9, 32.2], [5, 10])).toThrow(OutOfCoverageError);
  });
});
```
- [ ] **Step 2:** run → FAIL. **Step 3: implement** — append to `src/isochrone.ts`:
```ts
export interface IsochroneBand {
  minutes: number;
  polygon: IsochroneComputation['polygon'];
  degraded: boolean;
}

export interface IsochroneBandsComputation {
  bands: IsochroneBand[];
  snapDistanceM: number;
}

/**
 * Multi-band isochrone: one snap, ONE Dijkstra at the largest cutoff, then a
 * polygonization per band from the same travel-time array. Entries beyond a
 * band's cutoff behave exactly like Infinity in polygonize's filters, so each
 * band's polygon is identical to a standalone computeIsochrone at that cutoff.
 */
export function computeIsochroneBands(
  graph: WalkGraph,
  origin: LngLat,
  bandsMinutes: number[],
): IsochroneBandsComputation {
  if (bandsMinutes.length === 0) throw new RangeError('bands must be non-empty');
  const sorted = [...bandsMinutes].sort((a, b) => a - b);
  for (const m of sorted) {
    if (!Number.isFinite(m) || m <= 0) throw new RangeError(`invalid band minutes: ${m}`);
  }
  const snap = snapOrigin(graph, origin);
  if (!snap) {
    throw new OutOfCoverageError(
      `No walkable street within ${SNAP_MAX_M} m of [${origin[0]}, ${origin[1]}] — outside the covered area.`,
    );
  }
  const times = shortestTimes(graph, snap, sorted[sorted.length - 1]! * 60);
  const bands = sorted.map((minutes) => {
    const { polygon, degraded } = polygonize(graph, times, snap, minutes * 60);
    return { minutes, polygon, degraded };
  });
  return { bands, snapDistanceM: snap.distM };
}
```
Barrel `src/index.ts`: add `computeIsochroneBands` and the two new types to the existing `./isochrone` export line.
- [ ] **Step 4:** `pnpm --filter @ilsochrone/engine test` → all green (26 + 4 new). **Step 5:** commit `feat(engine): computeIsochroneBands - one Dijkstra, per-band polygonization`.

### Task U2: Providers — bands schema + `LocalIsochroneProvider.getIsochroneBands`

**Files:** Modify `packages/providers/src/isochrone/types.ts`, `packages/providers/src/isochrone/local.ts`, `packages/providers/src/isochrone/index.ts`; Test append `packages/providers/src/isochrone/local.test.ts`.

**Interfaces produced:**
```ts
export const IsochroneBandsRequestSchema; // { origin, mode, bands: TimeBandMin[] (nonempty) }
export type IsochroneBandsRequest;
export interface IsochroneBandsResult { bands: { minutes: TimeBandMin; polygon: Polygon | MultiPolygon }[]; metadata: ProviderMetadata; }
export type IsochroneBandFeature = Feature<Polygon | MultiPolygon, { minutes: number }>;
export interface IsochroneBandsFeatureCollection { type: 'FeatureCollection'; features: IsochroneBandFeature[]; metadata: ProviderMetadata; }
interface IsochroneProvider { /* existing */ getIsochroneBands?(req: IsochroneBandsRequest): Promise<IsochroneBandsResult>; }
```

- [ ] **Step 1: failing tests** (append to `local.test.ts`):
```ts
describe('getIsochroneBands', () => {
  it('returns ascending bands sharing one metadata block', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    const res = await p.getIsochroneBands({ origin: [34.7809, 32.0809], mode: 'walk', bands: [15, 5, 10] });
    expect(res.bands.map((b) => b.minutes)).toEqual([5, 10, 15]);
    for (const b of res.bands) expect(['Polygon', 'MultiPolygon']).toContain(b.polygon.type);
    expect(res.metadata.provider).toBe('local');
    expect(res.metadata.engine?.version).toBeTruthy();
  });

  it('rejects invalid band values via the schema', async () => {
    const p = new LocalIsochroneProvider({ source: fixtureSource() });
    await expect(
      p.getIsochroneBands({ origin: [34.7809, 32.0809], mode: 'walk', bands: [7] as never }),
    ).rejects.toThrow();
  });
});
```
- [ ] **Step 2:** run → FAIL. **Step 3: implement.** In `types.ts` add (after the existing request schema; import `Feature` from geojson):
```ts
export const IsochroneBandsRequestSchema = z.object({
  origin: LngLatSchema,
  mode: TravelModeSchema,
  bands: z
    .array(
      z.number().int().refine(
        (n): n is TimeBandMin => (TIME_BANDS_MIN as readonly number[]).includes(n),
        { message: `each band must be one of ${TIME_BANDS_MIN.join(', ')}` },
      ),
    )
    .nonempty(),
});
export type IsochroneBandsRequest = z.infer<typeof IsochroneBandsRequestSchema>;

export interface IsochroneBandsResult {
  bands: { minutes: TimeBandMin; polygon: Polygon | MultiPolygon }[];
  metadata: ProviderMetadata;
}

/** Wire shape of /api/isochrone?bands=1 — shared by the route and the client hook. */
export type IsochroneBandFeature = Feature<Polygon | MultiPolygon, { minutes: number }>;
export interface IsochroneBandsFeatureCollection {
  type: 'FeatureCollection';
  features: IsochroneBandFeature[];
  metadata: ProviderMetadata;
}
```
and extend the interface: `getIsochroneBands?(req: IsochroneBandsRequest): Promise<IsochroneBandsResult>;`.
In `local.ts` add (reusing the existing `getGraph`/metadata helpers — factor the metadata construction into a private `buildMetadata(graph, degraded: boolean)` used by both methods):
```ts
async getIsochroneBands(reqInput: IsochroneBandsRequest): Promise<IsochroneBandsResult> {
  const req = IsochroneBandsRequestSchema.parse(reqInput);
  if (!this.supports(req.mode)) {
    throw new Error(`local engine does not support mode "${req.mode}" yet`);
  }
  const graph = await this.getGraph();
  const { bands } = computeIsochroneBands(graph, req.origin, req.bands);
  const anyDegraded = bands.some((b) => b.degraded);
  return {
    bands: bands.map((b) => ({ minutes: b.minutes as TimeBandMin, polygon: b.polygon })),
    metadata: this.buildMetadata(graph, anyDegraded),
  };
}
```
Export the new schema/types from `isochrone/index.ts` (and thus the main barrel — types only, no runtime weight).
- [ ] **Step 4:** providers tests green. **Step 5:** commit `feat(providers): optional getIsochroneBands on the isochrone seam; local implementation`.

### Task U3: Route — `bands=1` + degradation; hook `useIsochroneBands`

**Files:** Modify `apps/web/src/app/api/isochrone/route.ts`; Create `apps/web/src/lib/hooks/useIsochroneBands.ts`; Test append `apps/web/src/lib/server/isochrone-providers.test.ts`.

**Interfaces produced:** route `GET ...&bands=1` → `IsochroneBandsFeatureCollection` (adds warning `{ code: 'bands_unsupported' }` when degrading); hook `useIsochroneBands({ lng, lat, mode, minutes })` → SWR of that FC (fetches all five bands at `t=30`; on `bands_unsupported` re-keys per selected `minutes`).

- [ ] **Step 1: failing route tests** (append to the route-integration describe):
```ts
  it('serves five nested bands in one response', async () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    __resetIsochroneProvidersForTests();
    const { GET } = await import('../../app/api/isochrone/route');
    const res = await GET(new Request('http://test/api/isochrone?lng=34.7745&lat=32.075&t=30&mode=walk&bands=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('FeatureCollection');
    expect(body.features.map((f: { properties: { minutes: number } }) => f.properties.minutes)).toEqual([5, 10, 15, 20, 30]);
    expect(body.metadata.provider).toBe('local');
  });

  it('bands request still maps out-of-coverage to 422', async () => {
    process.env.ISOCHRONE_PROVIDER = 'local';
    __resetIsochroneProvidersForTests();
    const { GET } = await import('../../app/api/isochrone/route');
    const res = await GET(new Request('http://test/api/isochrone?lng=35.2137&lat=31.7683&t=30&mode=walk&bands=1'));
    expect(res.status).toBe(422);
  });
```
- [ ] **Step 2:** run → FAIL. **Step 3: implement route.** Extend `QuerySchema` with `bands: z.coerce.number().int().min(0).max(1).default(0)` (read `url.searchParams.get('bands') ?? undefined`). Inside the try, replace the single `getIsochrone` call with:
```ts
    const wantBands = parsed.data.bands === 1;
    const run = async (p: IsochroneProvider) => {
      if (!wantBands) return NextResponse.json(await p.getIsochrone(req), { headers: CACHE_HEADERS });
      const bandList = TIME_BANDS_MIN.filter((b) => b <= req.minutes);
      if (p.getIsochroneBands) {
        const r = await p.getIsochroneBands({ origin: req.origin, mode: req.mode, bands: bandList as [number, ...number[]] as never });
        return NextResponse.json(
          {
            type: 'FeatureCollection',
            features: r.bands.map((b) => ({ type: 'Feature', geometry: b.polygon, properties: { minutes: b.minutes } })),
            metadata: r.metadata,
          },
          { headers: CACHE_HEADERS },
        );
      }
      const single = await p.getIsochrone(req);
      return NextResponse.json(
        {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: single.polygon, properties: { minutes: req.minutes } }],
          metadata: {
            ...single.metadata,
            warnings: [...(single.metadata.warnings ?? []), { code: 'bands_unsupported', message: 'Active provider computes one band per request.' }],
          },
        },
        { headers: CACHE_HEADERS },
      );
    };
```
with `const CACHE_HEADERS = { 'Cache-Control': 's-maxage=60, stale-while-revalidate=600' };` hoisted, and the primary/fallback try/catch calling `run(primary)` / `run(fallback)` (OutOfCoverage still never falls back).
- [ ] **Step 4: hook** `useIsochroneBands.ts` (same style as `useIsochrone.ts`):
```ts
'use client';

/**
 * Fetches ALL time bands for the current origin/mode in one request, so the
 * time selector is instant client state. If the active provider can't compute
 * bands (warning `bands_unsupported`), falls back to refetching per selected
 * time like the classic hook.
 */
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  TIME_BANDS_MIN,
  type IsochroneBandsFeatureCollection,
  type TimeBandMin,
  type TravelMode,
} from '@ilsochrone/providers';

const MAX_BAND = TIME_BANDS_MIN[TIME_BANDS_MIN.length - 1]!;

interface Args {
  lng: number;
  lat: number;
  minutes: TimeBandMin;
  mode: TravelMode;
}

const fetcher = async (url: string): Promise<IsochroneBandsFeatureCollection> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error('isochrone_fetch_failed'), { status: res.status, body });
  }
  return res.json() as Promise<IsochroneBandsFeatureCollection>;
};

export function useIsochroneBands({ lng, lat, minutes, mode }: Args) {
  const [perTime, setPerTime] = useState(false);
  const lngR = round(lng, 4);
  const latR = round(lat, 4);
  const t = perTime ? minutes : MAX_BAND;
  const key = `/api/isochrone?lng=${lngR}&lat=${latR}&t=${t}&mode=${mode}&bands=1`;
  const swr = useSWR<IsochroneBandsFeatureCollection, Error & { status?: number }>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (swr.data?.metadata.warnings?.some((w) => w.code === 'bands_unsupported')) setPerTime(true);
  }, [swr.data]);

  return swr;
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}
```
- [ ] **Step 5:** web tests green; commit `feat(web): bands=1 FeatureCollection endpoint with degradation + useIsochroneBands hook`.

### Task U4: Design tokens + font + primary-color sweep

**Files:** Modify `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`, `apps/web/src/app/layout.tsx`, and the four control components' selected/action classes.

Load the `frontend-design` skill before starting this task.

- [ ] **Step 1:** `globals.css` `:root` block becomes (dark block untouched for the later round):
```css
  :root {
    --background: 40 33% 99%;
    --foreground: 24 10% 10%;
    --muted: 40 12% 94%;
    --muted-foreground: 25 5% 45%;
    --border: 33 14% 88%;
    --accent: 33 100% 96%;
    --accent-foreground: 15 75% 28%;
    --primary: 21 88% 40%;          /* #C2410C — 4.8:1 on white */
    --primary-hover: 21 90% 48%;    /* #EA580C */
    --primary-foreground: 0 0% 100%;
    --band-fill: #f97316;
    --band-ring: #c2410c;
    --radius: 0.75rem;
  }
```
- [ ] **Step 2:** `tailwind.config.ts` colors add `primary: 'hsl(var(--primary))'`, `'primary-hover': 'hsl(var(--primary-hover))'`, `'primary-foreground': 'hsl(var(--primary-foreground))'`; fontFamily sans becomes `['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif']`; borderRadius extend `xl: 'var(--radius)'`.
- [ ] **Step 3:** `layout.tsx`:
```tsx
import { DM_Sans } from 'next/font/google';
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
```
and `<body className={`${dmSans.variable} font-sans bg-background text-foreground`}>`.
- [ ] **Step 4: primary sweep** — in `TimeSelector`, `ModeSelector`, `CategoryToggles`, `SurpriseMe` replace every `bg-blue-600 text-white` with `bg-primary text-primary-foreground` and `hover:bg-blue-700`/`border-blue-600` with `hover:bg-primary-hover`/`border-primary`; in `IlsochroneMap.tsx` `OriginPin` swap `bg-blue-600` → `bg-primary`. TimeSelector numerals get `tabular-nums` class.
- [ ] **Step 5:** `pnpm --filter @ilsochrone/web test && pnpm --filter @ilsochrone/web typecheck`; visual check via `pnpm dev` screenshot; commit `feat(web): warm design tokens, DM Sans, primary-color sweep`.

### Task U5: Band layers + legend + pin restyle + attribution fix

**Files:** Modify `apps/web/src/components/map/IlsochroneMap.tsx`, `apps/web/src/app/page.tsx`; Create `apps/web/src/components/legend/BandLegend.tsx`.

**Interfaces:** `IlsochroneMap` prop `polygon?: Polygon | MultiPolygon` is REPLACED by `bands?: IsochroneBandsFeatureCollection` + `selectedMinutes: number`. `BandLegend({ selectedMinutes }: { selectedMinutes: number })`.

- [ ] **Step 1:** In `IlsochroneMap.tsx`: drop the `polygonFeature` memo; replace the isochrone `<Source>` block with per-band layers (visibility-driven so time changes never refetch):
```tsx
      {bands && (
        <Source id="isochrone-bands" type="geojson" data={bands}>
          {TIME_BANDS_MIN.map((m) => (
            <Layer
              key={`fill-${m}`}
              id={`band-fill-${m}`}
              type="fill"
              filter={['==', ['get', 'minutes'], m]}
              layout={{ visibility: m <= selectedMinutes ? 'visible' : 'none' }}
              paint={{ 'fill-color': '#f97316', 'fill-opacity': 0.05 }}
            />
          ))}
          {TIME_BANDS_MIN.map((m) => (
            <Layer
              key={`line-${m}`}
              id={`band-line-${m}`}
              type="line"
              filter={['==', ['get', 'minutes'], m]}
              layout={{ visibility: m <= selectedMinutes ? 'visible' : 'none' }}
              paint={
                m === selectedMinutes
                  ? { 'line-color': '#c2410c', 'line-width': 2.5, 'line-opacity': 0.9 }
                  : { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.9 }
              }
            />
          ))}
        </Source>
      )}
```
(import `TIME_BANDS_MIN` from `@ilsochrone/providers`; overlapping translucent fills within/between layers composite, producing the deep-amber→pale-peach accumulation.)
- [ ] **Step 2: pin.** `OriginPin` becomes the warm droplet with pulse + drop-bounce:
```tsx
function OriginPin({ loading }: { loading?: boolean }) {
  return (
    <div
      role="img"
      aria-label="Origin (drag to move)"
      title="Drag me anywhere"
      className="relative flex h-12 w-12 cursor-grab items-center justify-center active:cursor-grabbing"
    >
      {loading && (
        <span className="absolute h-8 w-8 rounded-full bg-primary/40 motion-safe:animate-ping" aria-hidden />
      )}
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary shadow-lg motion-safe:transition-transform">
        <span className="h-2 w-2 rounded-full bg-white" />
      </div>
    </div>
  );
}
```
`IlsochroneMap` gains `originLoading?: boolean` passed through to the pin (the loading halo doubles as the loading state — spec §6).
- [ ] **Step 3: attribution fix.** Remove `customAttribution={tileStyle.attribution}` (sources already inject attribution; the prop duplicated it). Keep `compact`.
- [ ] **Step 4: legend** `BandLegend.tsx`:
```tsx
'use client';

import { TIME_BANDS_MIN } from '@ilsochrone/providers';
import { cn } from '@/lib/utils';

/** Composite swatches of #F97316 accumulation over the basemap (validated sequential ramp). */
const SWATCHES: Record<number, string> = {
  5: '#F4D1B9',
  10: '#F3D7C4',
  15: '#F3DDCE',
  20: '#F3E4D9',
  30: '#F2EAE4',
};

export function BandLegend({ selectedMinutes }: { selectedMinutes: number }) {
  const active = TIME_BANDS_MIN.filter((m) => m <= selectedMinutes);
  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2 text-xs shadow-md ring-1 ring-border backdrop-blur">
      <span className="font-medium">Walk time</span>
      <div className="flex overflow-hidden rounded-md ring-1 ring-border" role="img" aria-label={`Bands from 5 to ${selectedMinutes} minutes`}>
        {active.map((m) => (
          <span key={m} className={cn('h-3 w-6')} style={{ backgroundColor: SWATCHES[m] }} title={`${m} min`} />
        ))}
      </div>
      <span className="tabular-nums text-muted-foreground">5–{selectedMinutes} min</span>
    </div>
  );
}
```
- [ ] **Step 5: page wiring.** In `page.tsx`: swap `useIsochrone` → `useIsochroneBands` (same args); derive
```ts
  const selectedPolygon = useMemo(() => {
    const f = data?.features.filter((x) => x.properties.minutes <= state.minutes).at(-1);
    return f?.geometry;
  }, [data, state.minutes]);
```
and use `selectedPolygon` everywhere `data.polygon` was used (POI bbox, `isInsidePolygon`, SurpriseMe). Pass `bands={data}` + `selectedMinutes={state.minutes}` + `originLoading={isLoading}` to the map; render `<BandLegend selectedMinutes={state.minutes} />` bottom-left (`absolute bottom-4 left-4`). Loading text leaves `Status` (errors only now).
- [ ] **Step 6:** run web tests + smoke locally; commit `feat(web): nested band layers, legend, warm origin pin, attribution fix`.

### Task U6: ControlBar + LogoChip/InfoPopover (desktop layout)

**Files:** Create `apps/web/src/components/controls/ControlBar.tsx`, `apps/web/src/components/brand/LogoChip.tsx`; Modify `apps/web/src/app/page.tsx` (header region), `CategoryToggles.tsx` (pastel chips).

- [ ] **Step 1:** `LogoChip.tsx` — compact brand + info popover (no new deps; useState + click-outside via `onBlur` on a focus-trapping wrapper):
```tsx
'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

export function LogoChip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2 shadow-md ring-1 ring-border backdrop-blur transition-colors hover:bg-accent"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">i</span>
        <span className="text-sm font-semibold">ilsochrone</span>
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="About ilsochrone" className="absolute left-0 top-full z-10 mt-2 w-64 rounded-xl bg-background p-3 text-sm shadow-lg ring-1 ring-border">
          <p className="font-medium">Where can you get on foot?</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>🧡 Drag the pin anywhere</li>
            <li>⏱️ Pick how long you&apos;re willing to walk</li>
            <li>📍 Right-click the map to drop a destination</li>
            <li>✨ Surprise me picks a reachable spot</li>
          </ul>
        </div>
      )}
    </div>
  );
}
```
- [ ] **Step 2:** `ControlBar.tsx` — one card composing the existing controls (children pattern so the sheet can reuse them later):
```tsx
'use client';

import { cn } from '@/lib/utils';

/** Single desktop control surface: mode · time · categories · surprise. */
export function ControlBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl bg-background/95 px-3 py-2 shadow-md ring-1 ring-border backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}
```
The inner selectors drop their own `border/shadow` cards (they live inside the bar now): in `TimeSelector`/`ModeSelector` change the wrapper class to `inline-flex rounded-lg bg-muted p-1`, in `CategoryToggles` to `flex flex-wrap gap-1`.
- [ ] **Step 3: pastel category chips.** In `CategoryToggles.tsx` add per-category styles and apply on the on-state:
```ts
const CATEGORY_STYLES: Record<PoiCategory, { chip: string; icon: string }> = {
  park: { chip: 'bg-emerald-100 text-emerald-900', icon: 'text-emerald-600' },
  cafe: { chip: 'bg-amber-100 text-amber-900', icon: 'text-amber-600' },
  restaurant: { chip: 'bg-rose-100 text-rose-900', icon: 'text-rose-600' },
  museum: { chip: 'bg-violet-100 text-violet-900', icon: 'text-violet-600' },
  viewpoint: { chip: 'bg-sky-100 text-sky-900', icon: 'text-sky-600' },
  beach: { chip: 'bg-cyan-100 text-cyan-900', icon: 'text-cyan-600' },
};
```
on-state button class: `cn('...', CATEGORY_STYLES[id].chip)`; icon gets `CATEGORY_STYLES[id].icon` when ON, `text-muted-foreground` when off; off-state chip `bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground`. Chips are `rounded-full px-2.5`.
- [ ] **Step 4: page header.** Replace the current `<header>` content: left `<LogoChip />`; center-right one `<ControlBar className="hidden md:flex">` containing `<ModeSelector/> <TimeSelector/> <CategoryToggles/> <SurpriseMe/>`. `SurpriseMe` label becomes `Surprise me ✨` (emoji in `<span aria-hidden>`). Wrap header in `md:flex-nowrap` and keep `pointer-events-none` on the outer shell.
- [ ] **Step 5:** tests + screenshot; commit `feat(web): unified desktop control bar, logo chip with info popover, pastel category chips`.

### Task U7: Mobile bottom sheet (vaul)

**Files:** Create `apps/web/src/components/sheet/MobileSheet.tsx`; Modify `apps/web/src/app/page.tsx`, `apps/web/package.json` (+`"vaul": "^1.1.2"`).

- [ ] **Step 1:** `pnpm --filter @ilsochrone/web add vaul`.
- [ ] **Step 2:** `MobileSheet.tsx`:
```tsx
'use client';

import { Drawer } from 'vaul';

/**
 * Persistent, non-modal bottom sheet for < md screens. Peek shows the time
 * selector + mode row; dragging up reveals categories, surprise, legend.
 */
export function MobileSheet({ peek, expanded }: { peek: React.ReactNode; expanded: React.ReactNode }) {
  return (
    <Drawer.Root open modal={false} dismissible={false} snapPoints={[0.28, 0.62]} defaultSnapPoint={0.28}>
      <Drawer.Portal>
        <Drawer.Content
          aria-label="Map controls"
          className="fixed inset-x-0 bottom-0 z-20 flex h-[62svh] flex-col rounded-t-2xl bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)] ring-1 ring-border outline-none"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
          <div className="flex flex-col gap-3 overflow-y-auto p-4">
            {peek}
            {expanded}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```
(If the installed vaul version names the prop `activeSnapPoint`/`setActiveSnapPoint` instead of `defaultSnapPoint`, hold it in a `useState` — the Playwright assertion is the arbiter, not the prop name.)
- [ ] **Step 3:** In `page.tsx` render `<div className="md:hidden"><MobileSheet peek={<><TimeSelector .../><ModeSelector .../></>} expanded={<><CategoryToggles .../><SurpriseMe .../><BandLegend .../></>} /></div>`; the desktop `ControlBar` keeps `hidden md:flex`; move the desktop `BandLegend` into a `hidden md:block absolute bottom-4 left-4` wrapper.
- [ ] **Step 4:** manual check at 375 px + tests; commit `feat(web): vaul bottom sheet — mobile controls stop eating the map`.

### Task U8: Product states — 422 card, empty hint, coach mark

**Files:** Create `apps/web/src/components/onboarding/CoachMark.tsx`; Modify `apps/web/src/app/page.tsx` (Status + errorMessage + take-me-back + empty hint).

- [ ] **Step 1: 422 + Status.** `Status` handles errors only; for `status === 422` render a card instead of the pill:
```tsx
function Status({ error, onTakeMeBack }: { error: unknown; onTakeMeBack: () => void }) {
  if (!error) return null;
  const status = (error as { status?: number }).status;
  if (status === 422) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-xl bg-background/95 px-4 py-3 text-sm shadow-md ring-1 ring-border backdrop-blur">
          <span>🗺️ Outside the map! This demo covers the Tel Aviv metro.</span>
          <button
            type="button"
            onClick={onTakeMeBack}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Take me back
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
      <div className="rounded-full bg-background/95 px-4 py-1.5 text-sm shadow-md ring-1 ring-border backdrop-blur">
        {errorMessage(error)}
      </div>
    </div>
  );
}
```
`onTakeMeBack` in the page resets origin to `DEFAULT_ORIGIN` (from `lib/config`) and fires `setCameraTarget({...DEFAULT_ORIGIN, zoom: 13, key: Date.now()})`. The old `isLoading` pill is gone (pin halo covers loading).
- [ ] **Step 2: empty hint.** Under the map when `data && visiblePois.length === 0 && state.categories.length > 0`: small chip above the legend: `No places in range — try more time? 🤏` (same pill styling, `text-muted-foreground`).
- [ ] **Step 3: coach mark** `CoachMark.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';

const KEY = 'ilso.coachmark.v1';

/** One-time hint bubble near the pin; dismissed on any interaction. */
export function CoachMark({ dismissed }: { dismissed: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!dismissed && localStorage.getItem(KEY) !== 'done') setShow(true);
  }, [dismissed]);
  useEffect(() => {
    if (dismissed && show) {
      localStorage.setItem(KEY, 'done');
      setShow(false);
    }
  }, [dismissed, show]);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[calc(50%-4.5rem)] -translate-x-1/2">
      <div className="motion-safe:animate-bounce rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-background shadow-lg">
        Drag me! Right-click drops a destination 👇
      </div>
    </div>
  );
}
```
Page passes `dismissed` = true once origin moved or destination picked (track with a `hasInteracted` boolean set in `onOriginDragEnd`/`onPickDestination`).
- [ ] **Step 4:** tests + commit `feat(web): playful 422 state, empty-POI hint, one-time coach mark`.

### Task U9: DestinationCard/NavigateTo/microcopy polish

**Files:** Modify `apps/web/src/components/destination/DestinationCard.tsx`, `NavigateTo.tsx`, `PoiLayer.tsx` (selected-POI name chip + close-zoom glyphs).

- [ ] **Step 1:** DestinationCard: `rounded-xl` → keep structure, swap any blue classes to primary tokens, title `font-semibold`, add `motion-safe:animate-in fade-in zoom-in-95 duration-200` if tailwindcss-animate is present — it is NOT; instead add a tiny CSS keyframe in globals.css (`@keyframes ilso-pop { from { opacity: 0; transform: scale(.96) } }` + `.ilso-pop { animation: ilso-pop 180ms ease-out }` gated by `@media (prefers-reduced-motion: no-preference)`) and apply `ilso-pop`.
- [ ] **Step 2:** `PoiLayer.tsx`: selected POI gets a name chip under the dot (`<span className="absolute top-full mt-1 whitespace-nowrap rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium shadow ring-1 ring-border">{name}</span>`); dots scale `h-3.5 w-3.5` default. Category glyphs at close zoom: render the lucide icon inside the dot when the map zoom ≥ 15 — PoiLayer receives `zoom` prop from page viewState; icon `h-2.5 w-2.5 text-white`.
- [ ] **Step 3:** Copy sweep: SurpriseMe title text (already ✨ from U6), OriginPin title "Drag me anywhere" (done U5), page `<p>` subtitle in LogoChip popover only. Tests + commit `feat(web): destination card pop, POI name chips + glyphs, microcopy warm-up`.

### Task U10: Smoke test update + screenshots + full verify

**Files:** Modify `apps/web/e2e/smoke.spec.ts`.

- [ ] **Step 1:** Update the smoke test for bands (replace steps 1/4 assertions):
```ts
  // 1. Initial response carries all five nested bands from the local engine.
  const first = await firstIso;
  const body = await first.json();
  expect(body.type).toBe('FeatureCollection');
  expect(body.features).toHaveLength(5);
  expect(body.metadata.provider).toBe('local');

  // 4. Changing the time band is INSTANT — no new isochrone request.
  let extraRequests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/isochrone')) extraRequests++;
  });
  await page.getByRole('radio', { name: '30 min' }).click();
  await page.waitForTimeout(1500);
  expect(extraRequests).toBe(0);
```
(The drag step still expects ONE new request with a different URL — keep it, updating the predicate to `bands=1`.) Add a mobile assertion test:
```ts
test('mobile: bottom sheet hosts the controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.getByLabel('Map controls')).toBeVisible();
  await expect(page.getByLabel('Map controls').getByRole('radio', { name: '15 min' })).toBeVisible();
});
```
- [ ] **Step 2:** `npx playwright test` green; capture desktop + mobile screenshots (same harness as before) and send to the user.
- [ ] **Step 3:** Full verify: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Commit `test(e2e): bands smoke - five features, instant time change, mobile sheet`.

### Task U11: Docs + finish

- [ ] **Step 1:** `docs/TASKS.md`: add `### T-19 · UI elevation round (DONE <date>)` entry mirroring T-18's format (goal/files/DoD, referencing the spec).
- [ ] **Step 2:** Final review (whole-branch), fix findings, then finishing-a-development-branch: merge to `main`, push (owner pre-approved push cadence this session).

## Self-Review

1. **Spec coverage:** §2 tokens/font/motion → U4; §3 layout → U6 (desktop) + U7 (mobile) + legend/attribution in U5; §4 map graphics → U5 + U9 (POI glyphs/chips); §5 bands API → U1–U3 (engine/provider/route/hook incl. degradation re-key); §6 states → U5 (loading halo) + U8 (422/empty/coach mark); §7 components/testing → U1–U10 as listed, frontend-design loaded in U4; §8 non-goals — nothing here builds dark mode/clustering/panel/worker/custom basemap.
2. **Placeholder scan:** clean — every code step carries code; the vaul snap-point prop note is a version check with the e2e test as arbiter.
3. **Type consistency:** `IsochroneBandsFeatureCollection` defined in providers types (U2) and consumed by route (U3), hook (U3), map props (U5); `selectedMinutes: number` consistent across map/legend; `computeIsochroneBands` signature matches between U1 engine impl and U2 provider call.

## Execution

Inline (established with the owner this session to conserve tokens): execute tasks in order with TDD, commit per task, screenshots at U4/U6/U7/U10 checkpoints, final whole-branch review subagent before merge.
