# Testing

> **Last Updated:** 2026-04-14

## Quick Tests (run after every commit)

```bash
npx tsc --noEmit
npm run lint -- --max-warnings 0
npm test
```

| Check | Command | What it catches |
|-|-|-|
| Type check | `npx tsc --noEmit` | Type errors, missing imports |
| Lint | `npm run lint -- --max-warnings 0` | Style violations, unused vars |
| Unit tests | `npm test` (Vitest) | API route logic, utility regressions |

## Deep Tests (run before PRs / after significant changes)

```bash
npm test -- --reporter=verbose         # all unit tests
npx playwright test tests/e2e/         # E2E smoke
```

| Suite | Trigger | What it covers |
|-|-|-|
| API route tests | After touching API routes | analyze-reference, projects, templates, export, generate-backdrop, R2, diagnostics |
| E2E smoke | After UI changes | Basic page loads and navigation |

## Comprehensive E2E (run for releases / heavy testing sessions)

```bash
npm run build && npm run test:e2e
```

### E2E Prompt

> To generate a comprehensive test suite, open a fresh Claude Code session from this repo and provide a prompt describing all flows to test. Update this section with the prompt when created.

## Test Infrastructure

| Component | Detail |
|-|-|
| Unit framework | Vitest |
| E2E framework | Playwright |
| Test dirs | `src/app/api/**/route.test.ts` (unit), `tests/e2e/` (E2E) |
| CI job | `check` (tsc + lint) -> `e2e` (PR-only) -> `auto-merge` |
| Data | Mocked for unit, real services for E2E |

## Test Conventions

- API route tests co-located with routes (`route.test.ts`)
- Vitest for unit/integration, Playwright for E2E
- Use `test.skip()` when required services are unavailable

## Coverage Gaps (known)

| Area | Status | Notes |
|-|-|-|
| E2E beyond smoke tests | Minimal | Only basic page loads |
| Image generation pipeline | Unit only | R2 + backdrop generation mocked |
