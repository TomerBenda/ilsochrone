# First run — verify the scaffold

The repo was scaffolded without running `pnpm install` from inside the agent's sandbox (couldn't boot a Node environment). Before writing any new code, walk through this once on your machine to confirm the structure compiles end-to-end. Total time: ~5 minutes plus install.

## 1. Toolchain

You need Node 20.11 or newer and pnpm 9. The cleanest setup on Windows is via [Volta](https://volta.sh/) or [nvm-windows](https://github.com/coreybutler/nvm-windows), or use WSL2.

```bash
node --version    # v20.11.x or newer
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm --version    # 9.12.x
```

## 2. Install

From the repo root:

```bash
pnpm install
```

This installs everything for both `apps/web` and `packages/providers`. First install pulls a lot — Next.js, MapLibre, react-map-gl, dev tooling. Expect 60–120 seconds.

## 3. Verify the providers package

```bash
pnpm --filter @ilsochrone/providers typecheck
pnpm --filter @ilsochrone/providers test
```

You should see:
- Typecheck: zero errors.
- Tests: 5 tests passing in `ors.test.ts`. They use a fixture (no live ORS calls).

If typecheck fails, common causes:
- Missing `@types/geojson` — already in deps; `pnpm install` should have it.
- Module resolution complaints — providers package uses extensionless imports under `moduleResolution: "Bundler"`. If you see "Cannot find module './types'" you may be on an older TS; pin to the version in `package.json`.

## 4. Verify the web app

```bash
pnpm --filter @ilsochrone/web typecheck
```

Zero errors expected. If you see complaints about the `@ilsochrone/providers` import, run `pnpm install` from the root again — it links workspace packages.

## 5. Run the dev server

You'll need API keys before the map renders.

```bash
# IMPORTANT: env vars live in apps/web/, not at the repo root.
# Next.js looks for .env.local next to next.config.mjs.
cp apps/web/.env.example apps/web/.env.local
# Open apps/web/.env.local and fill in:
#   ORS_API_KEY              from https://openrouteservice.org/dev/#/signup
#                             (verify the email — keys don't work until verified)
#   GEOAPIFY_API_KEY         from https://myprojects.geoapify.com/
#   NEXT_PUBLIC_STADIA_API_KEY from https://client.stadiamaps.com/
pnpm dev
```

Next.js only reads `.env.local` at server start. After editing it, restart `pnpm dev`.

Open <http://localhost:3000>. You should see:

- A Tel Aviv basemap from Stadia.
- A blue origin pin (defaults to downtown TLV until geolocation resolves).
- A mode selector (Walking enabled, others disabled with "Phase 2" tooltip).
- A time selector (5/10/15/20/30 min).
- A blue translucent isochrone polygon around the pin.
- "Computing isochrone…" toast at the bottom while a request is in flight.

Drag the pin or change the time — the polygon should re-render within ~1.5 s.
Copy the URL, paste in a new tab — same view.

**Right-click** anywhere on the map — a "Drop point" card appears with deep links to Google Maps, Waze, Moovit, Apple Maps, OpenStreetMap, plus a "Copy coords" button. On phones, hold to trigger the same gesture. Plain click dismisses an open card without setting a new one.

POI markers (parks, cafés, restaurants, museums, viewpoints, beaches) render inside the polygon. Toggle categories from the panel under the time/mode controls. Click a marker → same destination card as right-click, with the POI's name pre-filled.

The **Surprise me** button picks a random reachable POI, flies the camera there, and opens the destination card. Disabled when no POIs are visible (toggle a category or expand time). Animation respects `prefers-reduced-motion`.

## 6. Known gaps (intentional)

These land in subsequent tasks:

- POI overlay markers (T-09)
- Category toggles sidebar (T-09)
- "Surprise me" button (T-11)
- Open Graph image (T-14)
- Playwright smoke (T-13)
- GitHub Actions CI is wired but not yet validated against the repo on GitHub.

The map-click DestinationCard is wired and uses the same `NavigateTo` widget T-09 and T-11 will consume. See ADR-0005.

If anything earlier than that doesn't work, that's a bug — open a task or fix it before moving on.

## 7. If something is wrong

The most likely failure modes:

| Symptom | Likely cause |
|---|---|
| `Module '@ilsochrone/providers' has no exported member …` | Re-run `pnpm install` from repo root. |
| `window is not defined` during `next build` | A non-`'use client'` file imports something that touches `window`. The map uses `next/dynamic({ ssr: false })` precisely to avoid this. |
| Map renders blank, no tiles | `NEXT_PUBLIC_STADIA_API_KEY` missing or rejected. Stadia gates by referer in production; for `localhost` the key is required. |
| 502 from `/api/isochrone` | Upstream ORS failure. In dev, the JSON response now includes a `debug` field with the real status and body. Check Network tab → response, or your Next terminal — the line starts with `[/api/isochrone] failed`. |
| 401 `missing_api_key` | `.env.local` is missing or wasn't picked up. Restart `pnpm dev` after editing it. |
| 401 `upstream_unauthorized` | ORS rejected your key. Two common causes: you didn't click the verification link in your ORS signup email, or you pasted the wrong key. Test directly: `curl -H "Authorization: <KEY>" -H "Content-Type: application/json" -d '{"locations":[[34.78,32.08]],"range":[900]}' https://api.openrouteservice.org/v2/isochrones/foot-walking`. |
| Polygon never renders | Look at the Network tab — `/api/isochrone` should return 200 with a `polygon` field. |
