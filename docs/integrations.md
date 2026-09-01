# CompoMate — Integrations

**Last Updated:** 2026-09-01

---

## Supabase

**Purpose:** Session and template persistence (opt-in). Stores composition state, backdrop metadata, usage logs for future metering.

**Env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` — Project URL (both accepted)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Client-side anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only service role key

**Auth method:** Service role key for server-side operations. No user auth in Phase 1 (user_id nullable everywhere).

**Failure behavior:** Session save/load fails gracefully. Core compositing and export work without Supabase being available.

**Dashboard:** <!-- TODO: verify Supabase project ref for CompoMate -->

---

## Cloudflare R2

**Purpose:** Primary file storage for all uploads (subjects, backdrops) and export outputs. Bypasses Vercel's 4.5MB request body limit — clients upload direct to R2 via presigned PUT URLs.

**Env vars:**
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 S3-compatible access key
- `R2_SECRET_ACCESS_KEY` — R2 S3-compatible secret
- `R2_BUCKET_NAME` — Bucket name (default: `compomate-uploads`)
- `R2_ENDPOINT` — `https://<account-id>.r2.cloudflarestorage.com`

**Auth method:** S3-compatible HMAC credentials via `@aws-sdk/client-s3`.

**Failure behavior:** Upload fails → user sees error, export blocked. No fallback storage.

**Dashboard:** https://dash.cloudflare.com (account `567ea5037192058824210f33150dd6cd`) → R2

---

## fal.ai (Flux and Topaz)

**Purpose:** AI backdrop exploration and production finishing.

- Guided Background Studio exploration uses `fal-ai/flux/schnell` to return three 1024×1280 (4:5) direction options in one bounded request.
- Manual AI Generate retains Flux Pro Ultra and Ideogram v2 choices.
- `topaz/upscale/image/precision` finishes only the selected direction at 4×. A standard guided direction therefore becomes a 4096×5120 production master without inventing a second design.
- Provider completion responses carry lightweight image references only. The browser retrieves full-resolution bytes through a same-origin allowlisted streaming route before uploading them directly to R2, avoiding Vercel's 4.5MB function payload ceiling without reducing image quality.
- Generated plates explicitly exclude people, player names/numbers, words, and invented logos. Exact team names and uploaded logos remain editable application overlays.

**Env vars:**
- `FAL_KEY` — fal.ai API key

**Auth method:** Bearer token (`FAL_KEY`) in Authorization header.

**Failure behavior:** Generation fails → user sees an error toast and existing assets remain usable. Every generated option is uploaded to R2 before a project can be saved; an individual storage failure is labeled on the thumbnail and exposes `Retry save`.

**Dashboard:** https://fal.ai/dashboard

---

## Google Gemini

**Purpose:** Reference photo analysis. Users can upload a real photo of a backdrop/scene and Gemini generates a matching backdrop prompt or analysis.

**Env vars:**
- `GEMINI_API_KEY` — Google AI Studio API key

**Auth method:** API key in request.

**Failure behavior:** Analysis fails gracefully — user can still use manual prompt entry.

**Dashboard:** https://aistudio.google.com

---

## PostHog

**Purpose:** Product analytics and session recording. Tracks user interactions to understand usage patterns. No PII — anonymous sessions only.

**Env vars:**
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` — PostHog project token
- `NEXT_PUBLIC_POSTHOG_HOST` — Set to `/ingest` (proxied through Next.js) in production

**Project:** `312619` (SAIL — shared project with InternalPortalSAPD and marketing website)

**Init:** `src/instrumentation-client.ts` with `defaults: '2026-01-30'`. Do NOT add manual pageview captures — auto-capture handles it.

**Config:** `person_profiles: 'always'`, `maskAllInputs: true`, `maskInputOptions: { password: true }`, `session_recording` enabled.

**Failure behavior:** PostHog unavailable → analytics silently missing. No impact on compositing.

**Dashboard:** https://us.posthog.com (project 312619)

---

## Sentry

**Purpose:** Error tracking and performance monitoring for production errors in the export pipeline.

**Env vars:**
- `NEXT_PUBLIC_SENTRY_DSN` — Client-side error reporting
- `SENTRY_AUTH_TOKEN` — Source maps upload during build
- `SENTRY_ORG` — Sentry organization slug
- `SENTRY_PROJECT` — Sentry project slug

**Auth method:** DSN for event ingestion; auth token for source maps.

**Failure behavior:** Sentry unavailable → errors not reported, app continues.

**Dashboard:** https://sentry.io

---

## Upstash Redis (Optional)

**Purpose:** Distributed rate limiting across Vercel instances. Without this, rate limiting is per-instance (in-process). Recommended for production to prevent export/generate endpoint abuse.

**Env vars:**
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST endpoint
- `UPSTASH_REDIS_REST_TOKEN` — Upstash REST token

**Auth method:** Token in Authorization header.

**Failure behavior:** If vars not set, falls back to in-process rate limiting (per Vercel instance). Functional but allows higher aggregate rates.

**Dashboard:** https://console.upstash.com

---

## Vercel

**Purpose:** Hosting + CI/CD. Auto-deploys from `main` branch.

**Env vars:** All above must be set in Vercel project settings.

**Deploy trigger:** Push to `main` via CI squash-merge (check → e2e → auto-merge).

**Dashboard:** https://vercel.com
