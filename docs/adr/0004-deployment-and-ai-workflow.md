# ADR-0004: Deployment and AI-assisted workflow

- Status: Accepted
- Date: 2026-05-08
- Deciders: Tomer

## Context

The project's meta-goal is to practice industry-shaped, AI-assisted development. The deployment target and the development workflow are entangled: an agentic loop only earns its keep if there's a CI signal it can iterate against, a hosted preview to verify in, and a clear contract (the PRD/ADRs/tests) to plan from.

## Decision

### Hosting

- **App:** Vercel free Hobby tier. Auto-preview deploys per PR.
- **Repo:** GitHub, public. Branch protection on `main` requiring CI green.
- **Secrets:** Provider API keys live in Vercel project env vars (Production, Preview). `.env.example` is committed; `.env.local` is gitignored.
- **Phase 2 routing service:** Separate repo or `apps/otp` package, deployed independently to a VPS or Railway when phase 2 starts. Out of scope for this ADR.

### CI

GitHub Actions workflow on push and PR:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test` (Vitest, adapter unit tests with fixture responses)
4. `pnpm test:e2e` (one Playwright smoke test against a built preview)

Vercel attaches preview URLs to PRs; the agentic loop can verify changes visually before merge.

### AI workflow

Three patterns we'll exercise deliberately:

- **Spec-driven.** PRD and ADRs are the canonical source of truth. Every non-trivial change updates them first, then code. The agent reads them before planning. When the PRD and the code disagree, the code is wrong.
- **Agentic loop.** Use Claude Code in a sandboxed shell to drive feature work. Each task in `TASKS.md` becomes a self-contained prompt with: goal, files touched, tests to pass, and a definition of done. The loop runs typecheck + tests after every change.
- **Multi-agent / reviewer subagents.** For each PR, a reviewer subagent independently checks: PRD/ADR alignment, test coverage of new adapter behavior, license/attribution compliance, and that no provider-specific types leak past the adapter boundary. Reviewer findings go in the PR description.

What we are not doing in MVP:
- TDD as a hard discipline (the user opted out of it; we still write tests, but not test-first).
- A custom MCP layer for this project. The standard Claude Code tools are enough.

## Consequences

- We accept Vercel lock-in for the app. Mitigation: nothing Vercel-specific in app code beyond `next.config.js` and route handlers; export to any Node host is straightforward.
- A public repo means API keys must never appear in logs, error toasts, or client bundles. Add a CI step that greps for known key prefixes if any provider's keys have a recognizable pattern.
- Reviewer subagents add cost per PR; keep them focused with a tight checklist rather than open-ended review.
