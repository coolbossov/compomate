# CompoMate — Security

**Last Updated:** 2026-04-13

---

## Authentication

### Phase 1 (Current): No User Auth
CompoMate has no user accounts in Phase 1. All users are anonymous. The app is intended for trusted internal users at SA Picture Day — it is not a public multi-tenant SaaS.

Session persistence (save/load) is gated behind `COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=true` env var. In production this is `false` (disabled) unless explicitly enabled.

### Phase 3 (Planned): Supabase Auth
`user_id` columns exist and are nullable on all tables in anticipation of auth. Migration to auth-gated persistence will require RLS policy updates.

---

## Row Level Security (RLS)

All Supabase tables have RLS enabled. Policy model:

| Table | Authenticated Users | Service Role | Anonymous |
|-------|-------------------|--------------|-----------|
| `compomate_sessions` | No access (Phase 1) | Full access | No access |
| `compomate_templates` | No access (Phase 1) | Full access | No access |
| `compomate_backdrops` | No access (Phase 1) | Full access | No access |
| `compomate_usage_logs` | No access (Phase 1) | Full access | No access |

All database operations are server-side only via service role key. Client-side Supabase operations use the anon key with no table-level permissions in Phase 1.

---

## API Rate Limiting

Export (`/api/export`) and generate-backdrop (`/api/generate`) endpoints are rate-limited:
- **Default:** In-process per-instance counters
- **Production (recommended):** Upstash Redis distributed limiting (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`)

Rate limiting prevents runaway exports (Sharp CPU cost) and AI generation abuse (fal.ai API cost).

---

## File Upload Security

- Files are uploaded directly to Cloudflare R2 via presigned PUT URLs with 5-minute expiry
- The upload API (`/api/upload`) generates presigned URLs — it does not accept file bytes directly
- R2 access keys (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are server-only, never exposed to the client
- Presigned GET URLs for downloads are short-lived <!-- TODO: verify presigned GET URL expiry duration -->

---

## Session Recording (PostHog)

PostHog session recording is configured with `maskAllInputs: true` and `maskInputOptions: { password: true }`. This ensures name inputs and any text fields are masked in recordings. No PII should be captured.

---

## Content Security Policy

`next.config.ts` sets security headers including CSP. Key directives include allowlisting R2 endpoint, fal.ai, PostHog, and Sentry domains. <!-- TODO: verify specific CSP directives in next.config.ts -->

---

## Secret Management

- All secrets in Vercel environment variables — never hardcoded in source
- `SUPABASE_SERVICE_ROLE_KEY`, `R2_SECRET_ACCESS_KEY`, `FAL_KEY`, `GEMINI_API_KEY` are server-only
- `NEXT_PUBLIC_*` vars are safe for client-side use
- Sentry `SENTRY_AUTH_TOKEN` is build-time only (source map upload), not needed at runtime
