# CompoMate — AI Guardrails

## What this is

Professional volume photography composite tool. Takes cutout subject photos (dancers, athletes, students) and composites them onto studio backdrops — with reflections, shadows, fog, name overlays, and batch export. Target users: volume photography studios doing dance, gymnastics, martial arts, and school composites.

## What this is NOT

- Not a photo editor — it is a compositor for pre-cut subject PNGs onto backdrops only
- Not a retouching tool — no masking, no skin smoothing, no manual cutout
- Not a delivery platform — export only; delivery to clients is out of scope

## Hard rules

- Sharp is the compositing engine — do not replace with Canvas API or browser-side processing for batch work
- Export must support multiple print profiles: 8x10, 5x7, 4x5, 1x1
- Batch ZIP export must remain a core feature — never remove it
- All Claude/AI calls go through CLIProxyAPI — never direct to `api.anthropic.com`

## Architecture notes

- Stack: Next.js 16.2 (App Router), Tailwind v4, shadcn/ui, Supabase, Sharp, Vercel
- The codebase was a monolith (`page.tsx` at 2345 lines) — if refactoring, extract to components/ and types/ directories
- Core compositing pipeline lives in `export/route.ts`
- KB: `~/Github/ai-brain/30-Projects/Active/CompoMate/`
