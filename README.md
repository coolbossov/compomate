# CompoMate

CompoMate is a production-focused compositor for dance/gymnastics portraits.

## Implemented Scope (Phases 1-7)

- Single-image compositor with drag placement
- Reflection, fog, leg fade, and directional floor shadow
- Shadow controls:
  - on/off toggle
  - light direction + elevation controls
  - automatic light-direction estimation from backdrop
  - stance-aware natural shadow shaping
- Export profiles (`Original`, `8x10`, `5x7`, `4x5`, `1x1`) at 300 DPI
- Name overlays with style presets (`Classic`, `Outline`, `Modern`)
- Batch queue workflow with ZIP export and cancel/retry states
- fal.ai backdrop generation route (`POST /api/generate-backdrop`)
- Supabase project save/load routes:
  - `GET /api/projects`
  - `POST /api/projects`
  - `GET /api/projects/:projectId`
- API hardening:
  - input size guardrails
  - lightweight rate limiting per endpoint
  - stricter response errors
  - multipart export transport with client-side image optimization to avoid Vercel payload limits
- Production headers in `next.config.ts`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Create `.env.local` with the keys you plan to use:

```bash
# fal generation
FAL_KEY=
FAL_MODEL=fal-ai/flux/schnell

# optional Supabase persistence
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# only enable this for trusted internal environments until auth is added
COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=false

# optional (future feature path)
GEMINI_API_KEY=
```

## Supabase Migration

Migration file is included:

- `supabase/migrations/20260306_create_compomate_projects.sql`

Apply it with your Supabase migration workflow before using project save/load.
Remote Supabase save/load is disabled by default until authentication is implemented.

## Validation

```bash
npm run lint
npm run build
npm run audit
```
