# CompoMate — Environment Variables

**Last Updated:** 2026-04-24

Copy `.env.example` to `.env.local` and fill in real values. Never commit `.env.local`. Local dev: run `vercel env pull .env.local --environment=development` to sync from Vercel.

## Operating Rules

- Keep committed env documentation in this file and `.env.example`.
- Keep raw secret values only in approved local, GitHub, Vercel, Supabase, Cloudflare, or provider secret stores.
- Never commit service-role keys, R2 secrets, model keys, Sentry auth tokens, Redis tokens, or local env files.
- When an env var is added, removed, renamed, or behaviorally changed, update this file in the same change.

For CI/E2E (GitHub Actions), 3 secrets are required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Supabase project:** `qnfafwqjjbgiaygrdcoc` (name `Portal-Route`, org `MyStartup.me`, region `us-east-2`). Co-tenants: Portal + HELM share this free-tier project. Keepalive via Kuma monitor #121 (pings a Portal table — the DB instance is shared, so Portal pings keep CompoMate awake too). Prior ref `dlaaibvipvevtwolpdua` (SApictureDay org, name `internal-compomate-portal`) was retired from CompoMate runtime on 2026-04-24 but is **preserved, not paused** — kept alive by dedicated Kuma monitor #137 (6h HTTP ping) per user decision. Legacy `compomate_*` tables remain in place; dropping them is optional.

| Variable | Service | Purpose | Required |
|----------|---------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Project API URL (client-side) | Yes |
| `SUPABASE_URL` | Supabase | Project API URL (server-side alias — both accepted) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Anon/client key for browser operations | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Service role key — server-only, never expose to client | Yes |
| `R2_ACCOUNT_ID` | Cloudflare R2 | Cloudflare account ID for bucket access | Yes |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 | S3-compatible access key for R2 | Yes |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | S3-compatible secret for R2 | Yes |
| `R2_BUCKET_NAME` | Cloudflare R2 | R2 bucket name (default: `compomate-uploads`) | Yes |
| `R2_ENDPOINT` | Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | Yes |
| `FAL_KEY` | fal.ai | API key for AI backdrop generation (Flux Schnell) | No* |
| `GEMINI_API_KEY` | Google Gemini | API key for reference photo analysis | No* |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | PostHog | Analytics project token (shared SAIL project 312619) | No |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog | PostHog ingest host — set to `/ingest` in production | No |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Client-side error reporting DSN | No |
| `SENTRY_AUTH_TOKEN` | Sentry | Source map upload auth token (build-time only) | No |
| `SENTRY_ORG` | Sentry | Sentry organization slug | No |
| `SENTRY_PROJECT` | Sentry | Sentry project slug | No |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | Distributed rate limiting REST endpoint | No** |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | Distributed rate limiting REST token | No** |
| `COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE` | Feature flag | Set `true` to enable anonymous session save/load — NOT recommended for production | No |

**\* Required for AI features to work (backdrop generation / reference analysis). App runs without them — those tabs will show errors.**

**\*\* Without Upstash, rate limiting falls back to in-process per-instance counters. Sufficient for development; recommended for production.**
