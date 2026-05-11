# Developing Ilsochrone

Notes for working in this repo, aimed at someone newer to the Next.js + Turborepo stack. Read alongside the PRD, ADRs, and TASKS file.

## First-time setup

1. Install Node ≥ 20.11 and pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`).
2. `pnpm install` from the repo root.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` (note the path — Next.js reads this file relative to the web app, not the repo root) and fill in:
   - `ORS_API_KEY` from <https://openrouteservice.org/dev/#/signup> (verify the signup email — keys don't work until verified)
   - `GEOAPIFY_API_KEY` from <https://myprojects.geoapify.com/>
   - `NEXT_PUBLIC_STADIA_API_KEY` from <https://client.stadiamaps.com/>
4. `pnpm dev` and open <http://localhost:3000>.

A `.env.local` at the repo root will be silently ignored by Next. If you see "X not set" errors, that's the first thing to check.

## Day-to-day commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the Next.js app in watch mode. |
| `pnpm typecheck` | Runs `tsc --noEmit` across all packages via Turborepo. |
| `pnpm lint` | ESLint across all packages. Zero warnings tolerated. |
| `pnpm test` | Vitest unit tests (currently in `packages/providers`). |
| `pnpm test:e2e` | Playwright smoke tests (lands in T-13). |
| `pnpm format` | Format all source with Prettier. |

Turborepo caches everything; the second run of `pnpm typecheck` should be instant.

## Repo layout

```
apps/
  web/                  Next.js 14 App Router app
    src/
      app/              Pages and route handlers
      components/       UI components (map/, controls/)
      lib/              Hooks, helpers, config
packages/
  providers/            Provider abstraction (isochrone, poi, tile, transit)
    src/
      isochrone/        IsochroneProvider + ORS adapter
      poi/              PoiProvider + Geoapify adapter
      tile/             TileProvider + Stadia adapter
      transit/          TransitDataProvider (phase 2 only)
docs/                   PRD, ADRs, TASKS, research, this file
```

## How the layers talk

```
UI component        ─►  SWR hook    ─►  /api/* route handler  ─►  Provider adapter  ─►  External API
(client only)           (client)         (server only)             (server only)         (HTTPS)
```

Three rules to keep yourself out of trouble:

1. **Adapters never run in the browser.** They live in `packages/providers/src/{isochrone,poi}/*.ts` and are only imported from route handlers. The route handler hides API keys; the adapter implements the upstream contract.
2. **UI components don't know the provider.** They consume `Poi[]` and GeoJSON polygons. Switching ORS to OTP is a route-handler change, not a UI change.
3. **All provider responses go through Zod parsing in the adapter.** That's where typed safety begins. Anything past the adapter boundary is fully typed.

## Where to add new things

- New isochrone provider → new file in `packages/providers/src/isochrone/`, implement `IsochroneProvider`, swap in `apps/web/src/app/api/isochrone/route.ts`.
- New POI category → extend `PoiCategorySchema` in `packages/providers/src/types.ts`, add the mapping in each POI adapter, add the toggle button in `CategoryToggles.tsx` (T-09).
- New URL state field → extend `AppUrlState` in `apps/web/src/lib/url-state.ts` (parser + serializer + default).

## Conventions worth knowing

- **TypeScript strict + `noUncheckedIndexedAccess`.** Array and Record lookups return `T | undefined`. This catches off-by-one and missing-key bugs early. When you see a `Cannot read properties of undefined` in production, it's because someone disabled this somewhere.
- **`'use client'` is a runtime boundary, not a file-type boundary.** A file marked `'use client'` and everything it imports is bundled for the browser. The map component is dynamically imported with `ssr: false` because MapLibre touches `window` at module load.
- **Imports are extensionless inside the providers package.** TS with `moduleResolution: "Bundler"` resolves `./types` to `./types.ts`. We don't use the `.js` ESM extension because Next.js's webpack treats it literally and fails to resolve workspace-package files. If we ever publish providers as a standalone Node ESM package, we'd add a build step that rewrites these.
- **No emojis in code or commit messages.** No bullet-point essays in PR descriptions either; one paragraph per change.

## Running the agentic loop

This project is set up for AI-assisted development. The recommended loop:

1. Pick the next task from `docs/TASKS.md`.
2. Open Claude Code (or your agent of choice) in the repo root.
3. Paste the task entry as the prompt. The PRD and ADRs are already on disk, so the agent has full context.
4. Let the agent plan, edit, and run `pnpm typecheck && pnpm test`.
5. Open a PR. A reviewer subagent should be invoked manually with a checklist:
   - Does the change match the PRD? (Cite the section.)
   - Are there new provider-specific types leaking past adapter boundaries?
   - Is attribution still correct?
   - Did unit tests cover the new behavior?
6. Merge when CI is green and the reviewer's punchlist is clean.

When the PRD and the code disagree, fix the PRD first (commit the diff), then change the code. That keeps the spec honest.
