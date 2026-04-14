# CompoMate — AI Guardrails

## What this is

Professional volume photography composite tool. Takes cutout subject photos (dancers, athletes, students) and composites them onto studio backdrops — with reflections, shadows, fog, name overlays, and batch export. Target users: volume photography studios doing dance, gymnastics, martial arts, and school composites.

## What this is NOT

- Not a photo editor — it is a compositor for pre-cut subject PNGs onto backdrops only
- Not a retouching tool — no masking, no skin smoothing, no manual cutout
- Not a delivery platform — export only; delivery to clients is out of scope

## Git workflow (enforced — no exceptions)

- **Never commit directly to `main`** — all code changes go through a branch + PR
- **Auto-branch on first code edit** — the moment a session transitions from research/planning to implementation, create a branch before the first file edit. Use prefix conventions: `feat/`, `fix/`, `chore/`, `docs/`
- **Docs update is part of every PR — not a follow-up** — any change that touches DB schema, API shape, data flows, auth, or architecture must update the relevant `docs/` file(s) in the same commit:
  - New/altered DB columns or tables → `docs/database.md` (schema + migration history)
  - Architecture or flow change → `docs/architecture.md`
  - Design decision or trade-off → `docs/decisions.md` (add ADR, newest first)
  - New integration or external dependency → `docs/integrations.md`
  - New env var → `docs/environment.md`
  - Any shipped change → `CHANGELOG.md` (add entry under today's date)
- **End of session** — run `@review-2-code-commit` before pushing. This triggers the `opencode-review` GitHub Action on the PR automatically
- CI passes → PR is squash-merged automatically and branch is deleted

## Hard rules

- Sharp is the compositing engine — do not replace with Canvas API or browser-side processing for batch work
- Export must support multiple print profiles: 8x10, 5x7, 4x5, 1x1
- Batch ZIP export must remain a core feature — never remove it
- All Claude/AI calls go through CLIProxyAPI — never direct to `api.anthropic.com`

## CI / Testing

- **3-job CI pipeline**: `check` (lint+tsc+build) → `e2e` (PR-only, Playwright) → `auto-merge`
- **Vitest unit tests** run inside `check` job (`npm run test`)
- **`e2e` job builds then starts** production server (`npm run build && npm run start`) — not dev server
- **`auto-merge` uses `always()` pattern** — required because `e2e` is skipped on push to main
- **3 GitHub Secrets required** for E2E: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **No auth in E2E tests** — CompoMate uses session-cookie auth; tests verify public shell + API response codes only
- **Canvas tests are limited** — Konva canvas requires real assets; E2E only verifies app shell loads and APIs respond

## Architecture notes

- Stack: Next.js 16.2 (App Router), Tailwind v4, shadcn/ui, Supabase, Sharp, Vercel
- The codebase was a monolith (`page.tsx` at 2345 lines) — if refactoring, extract to components/ and types/ directories
- Core compositing pipeline lives in `export/route.ts`
- KB: `~/Github/ai-brain/30-Projects/Active/CompoMate/`
