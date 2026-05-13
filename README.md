# Ilsochrone

A Tel Aviv isochrone web app — pick a point, pick a time, see where you can get and what's worth visiting inside that area. Walking-only MVP; transit, driving, and bikeshare in later phases.

> Not a navigation app. The product is the answer to **"where can I get?"** — to encourage public transportation and spontaneous urban exploration.

## Quickstart

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in API keys
pnpm dev
```

Open <http://localhost:3000>. See [docs/DEVELOPING.md](docs/DEVELOPING.md) for the full setup walkthrough.

## Documentation

- [Product Requirements](docs/PRD.md)
- [Sprint Plan (T-01..T-15)](docs/TASKS.md)
- [Developer Guide](docs/DEVELOPING.md)
- [Research note — data sources & APIs](docs/research/01-data-sources.md)
- Architecture Decision Records:
  - [ADR-0001 — Web stack](docs/adr/0001-stack.md)
  - [ADR-0002 — Isochrone engine](docs/adr/0002-isochrone-engine.md)
  - [ADR-0003 — POI and tile providers](docs/adr/0003-poi-and-tile-providers.md)
  - [ADR-0004 — Deployment and AI workflow](docs/adr/0004-deployment-and-ai-workflow.md)
  - [ADR-0005 — Navigation handoff](docs/adr/0005-navigation-handoff.md)
  - [ADR-0006 — POI provider strategy (hybrid plan)](docs/adr/0006-poi-provider-strategy.md)

## Stack

Next.js 14 (App Router), TypeScript strict, Turborepo + pnpm workspaces, MapLibre GL JS, Tailwind, Zod, SWR, Vitest, Playwright. Deploys to Vercel.

## Status

Pre-alpha. Specs landed; scaffolding in place; walking isochrone slice (T-04 through T-07) wired. Run `pnpm dev` after adding API keys to see the map and a live polygon.
