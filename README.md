# CompoMate

CompoMate is an internal composite-production workstation for portrait workflows.
The current app is optimized for single-subject dance, gymnastics, and similar volume-photography composites, but the codebase is being kept modular enough to support broader internal studio workflows later.

## Current Product Surface

- Subject library with multi-file import, folder import, thumbnail management, and keyboard navigation
- Backdrop library with:
  - local uploads
  - fal.ai generation
  - Ideogram generation
  - Gemini-powered reference-photo prompt extraction
- Konva-based canvas editing with drag placement, zoom, nudging, crop guides, and side-by-side preview
- Auto placement with MediaPipe pose estimation plus centroid fallback
- Blend controls for shadow, reflection, fog, and leg fade
- Name entry with sticky last name, style presets, font pair presets, and live canvas overlay preview
- Export pipeline with:
  - 4000x5000 master output
  - crop-guide-based profile framing
  - batch queue
  - first-export approval gate
  - R2-backed asset/export flow with inline fallback
- Session continuity:
  - persisted editor settings
  - 24-hour session resume prompt
  - template save/load/import/export
- Optional Supabase project persistence with explicit internal-only safety gate
- Optional observability via Sentry, PostHog, Vercel Analytics, and Speed Insights

## Architecture Notes

- The editor is a Next.js 16 App Router app.
- Local editing uses browser object URLs for immediate responsiveness.
- When R2 is configured, imported subjects/backdrops upload in the background and exports prefer stored originals.
- Project snapshots now support both:
  - inline image payloads for no-storage environments
  - `r2Key` references for smaller persisted payloads
- MediaPipe WASM assets are vendored under `public/vendor/mediapipe/wasm` so pose estimation works without relying on a CDN at runtime.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For a production-mode smoke pass:

```bash
npm run build
npm run start
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill only the integrations you plan to use.

### R2

Used for subject, backdrop, and export asset storage. Optional, but recommended.

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=compomate-uploads
R2_ENDPOINT=
```

### AI

```bash
FAL_KEY=
GEMINI_API_KEY=
```

### Supabase

Used for templates and guarded project persistence.

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=false
```

### Observability

All optional.

```bash
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=/ingest

NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
```

## Supabase Migrations

Included migrations:

- `supabase/migrations/20260306_create_compomate_projects.sql`
- `supabase/migrations/20260307_create_compomate_templates.sql`

Project persistence remains disabled by default until authentication exists.
Templates can still be used via JSON import/export when Supabase is unavailable.

## Validation

```bash
npm run lint
npm run build
npm run audit
```

Recommended smoke flow after changes:

1. Import one subject and one backdrop.
2. Confirm the canvas updates and auto placement runs.
3. Enter first and last name.
4. Export one PNG.
5. Verify the first-export approval dialog appears.

## Notes

- Local runs outside Vercel intentionally skip Vercel Analytics and Speed Insights injection to avoid browser noise.
- If R2 is not configured, background asset uploads fail gracefully and export falls back to inline payloads.
- The current app is still an internal tool. Multi-user auth, ownership, and broader business workflow modeling are future work.
