# ADR-0001: Web stack — Next.js 14 + TypeScript + MapLibre

- Status: Accepted
- Date: 2026-05-08
- Deciders: Tomer

## Context

We need a web app for a 2-week MVP that's hireable on a CV, deployable free, and easy for an AI-assisted workflow (small files, conventional patterns, big training corpus). The user is newer to web dev and wants explanations as we go, so the stack should reward conventional choices over clever ones.

## Decision

- **Framework:** Next.js 14 App Router with TypeScript strict mode.
- **Monorepo:** Turborepo + pnpm workspaces. `apps/web` for the Next app; `packages/providers` for the swappable adapters; `packages/ui` for shared components.
- **Styling / components:** Tailwind CSS + shadcn/ui (copy-in components, no runtime).
- **Map:** MapLibre GL JS via `react-map-gl/maplibre`.
- **State / data:** React Server Components + SWR for client fetches. Zustand only if we need shared client state and SWR isn't enough.
- **Validation:** Zod across provider response parsing and URL state.
- **Tests:** Vitest for unit tests; Playwright for one end-to-end smoke test.
- **Tooling:** ESLint flat config, Prettier, husky + lint-staged.

## Why these and not others

- Next over Vite-only: we need Next route handlers as a thin proxy that hides API keys and adds caching. With pure Vite we'd hand-roll an Express layer.
- App Router over Pages Router: it's the default in 2026 and the pattern we want to learn. Costs us a small amount of confusion early; pays back in conventions for the rest of the project.
- MapLibre over Mapbox: open-source, no token required for the library, works with multiple tile providers, no vendor lock-in.
- Turborepo even at this size: forces clean package boundaries between providers and the app. Adds maybe an hour of setup; pays back when phase-2 adapters arrive.
- shadcn/ui over a UI library: no runtime cost, fully ownable, AI agents handle it well because the source is in our repo.

## Consequences

- New web devs working with App Router pay a server/client component learning tax. We'll annotate components clearly with `'use client'` only where needed and explain the boundary in code comments during MVP.
- Turborepo configuration is one extra moving part for a 2-week build.
- shadcn/ui means components are vendored — updates are manual. Acceptable for a portfolio project.
