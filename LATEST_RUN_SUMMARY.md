# CompoMate — Latest Run Summary

Last updated: 2026-03-20
Repo: `compomate`
Branch: `main` — commit `f1f93a7`

## Live URLs

| URL | Status | Notes |
|-|-|-|
| `https://composite.sapicture.day` | ✅ Working | HTTP 200, title=CompoMate |
| `https://app.sapicture.day` | ✅ Working | CF Worker custom domain |
| `https://compomate-sapd.vercel.app` | ✅ Working | Vercel alias |

## Build Status

| Check | Result |
|-|-|
| Tests | 339 passed, 0 failed |
| TypeScript | 0 errors |
| Lint | 0 errors |
| Vulnerabilities | 0 |
| Next.js | 16.2.0 |

## What was done this session (P0–P2 audit plan)

| Item | File(s) | Status |
|-|-|-|
| ESLint ignore `.open-next/**` + `.wrangler/**` | `eslint.config.mjs` | ✅ |
| `middleware.ts` → `proxy.ts` + test rename | `src/proxy.ts`, `src/proxy.test.ts` | ✅ |
| Next.js 16.1.6 → 16.2.0 + `npm audit fix` | `package.json` | ✅ |
| CF Workers dual-target config removed | `package.json`, `next.config.ts`, deleted `open-next.config.ts` + `wrangler.jsonc` | ✅ |
| Unused deps removed (`@uppy/*` ×5, `react-hook-form`, `next-themes`) | `package.json` | ✅ |
| CSV roster import → PapaParse | `src/components/panels/RosterImportPanel.tsx` | ✅ |
| Rate limiter → Upstash Redis (in-memory fallback) | `src/lib/server/rate-limit.ts` | ✅ |
| Crop preview fidelity (active profile mask + badge) | `src/components/workspace/DangerZoneOverlay.tsx` | ✅ |
| PostHog event tracking (5 events) | `src/lib/client/posthog.ts`, ExportPanel, FilePanel, BackdropPanel | ✅ |
| Uptime Kuma monitor #93 created | Kuma (external) | ✅ |
| All API routes: `await checkRateLimit(...)` | All route files | ✅ |
| All route tests: `mockResolvedValue` | All route test files | ✅ |

## Pending (Next Session)

1. **Action required:** Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel env vars (free Upstash tier) to activate distributed rate limiting
2. Item 4 (P2): Server-side batch export job queue
3. Item 8 (P2): BackdropPanel decomposition into sub-components
4. Item 9 (P3): R2 object lifecycle / cleanup

## Architecture Notes

- `src/proxy.ts` — Next.js proxy (not `middleware.ts`); handles auth header forwarding
- `src/lib/server/rate-limit.ts` — Upstash Redis when env vars present; in-memory Map fallback otherwise
- `src/lib/client/posthog.ts` — `captureEvent(name, props?)` wrapper; events: `subjects_imported`, `roster_loaded`, `backdrop_generated`, `export_completed`, `batch_export_completed`
- CF Workers removed entirely — Vercel-only deployment
- Kuma monitor #93: keyword `"status":"ok"` on `/api/diagnostics` every 5 min with `x-diagnostics-token` header
- `src/lib/server/r2.ts` — when `R2_WORKER_URL` is set, all R2 ops route through CF Worker (no S3 creds needed)

## Vercel project

Project ID: `prj_RBAWgaqCRkd6rG6gMJvtZk0XDnGv`
Team: `team_YpTZ9wntL6ct8x63gWi4SiAI`
Production URL: https://composite.sapicture.day

## Supabase

Project ref: `dlaaibvipvevtwolpdua` · Region: us-east-1 · 3 migrations applied
