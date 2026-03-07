# CompoMate — Agent Work Log

> This file is the persistent root changelog for this repo.
> Update it for every important investigation, code change, and commit.
> Format: newest entries at the top.

---

## [Unreleased] — 2026-03-07 — Second Audit Pass (Claude claude-sonnet-4-6)

### Summary
Five parallel specialist agents (Canvas, Export Pipeline, Store/State, API Security, UI/UX) audited the full codebase post-remediation. Found 40+ issues across severity levels. All critical and high items implemented immediately. 29 files changed, 319 insertions, 115 deletions.

### CRITICAL Fixes

**reflect.ts — Reflection was entirely invisible (pre-flip zeroing in wrong index space)**
- Zeroing loop iterated the wrong direction — was zeroing the feet region and keeping the body, making the reflection show nothing or inverted content
- Fixed: loop now zeroes rows `0..lowestRow` (above-feet region in pre-flip space), which become the bottom-transparent region after flip, leaving feet at the top of the reflection

**constants.ts — CROP_ZONES widthFrac used wrong math (guides were 25% too narrow)**
- `4×6` was `0.667` (the ratio itself, not the canvas fraction) — should be `0.833` (5000px × 4/6 ÷ 4000px)
- `5×7` was `0.714` — corrected to `0.893`
- Photographers composing shots using the guides were leaving insufficient margin

**store/index.ts — SSR crash: `sessionStorage` was used as the server-side fallback**
- `sessionStorage` is browser-only; falls through to it on server → `ReferenceError`
- Replaced with a proper no-op storage `{ getItem: () => null, setItem: () => {}, removeItem: () => {} }`

**SessionResumeDialog.tsx — "Start fresh" destroyed all work with zero confirmation**
- Single click on first-load dialog could wipe the entire session
- Added a two-step confirmation: first click shows inline "Clear all work?" prompt with Yes/Cancel

### HIGH Fixes

**reflect.ts — `reflectionBlurPx` was wired through the pipeline but never read**
- `BLUR_LAYERS` was fully hardcoded; the blur slider did nothing to export output
- Added `blurMultiplier = reflectionBlurPx / 10` scaling applied to each layer's `blurPx`

**pipeline.ts — `withoutEnlargement: true` silently prevented small subjects from scaling**
- Subjects under the target height were left at their original (small) size regardless of the height-% slider
- Removed the flag; subjects now always scale to fill the configured `subjectHeightPct`

**text.ts — `asPng()` returned `Uint8Array` but Sharp typed `composite.input` as `Buffer`**
- Wrapped result in `Buffer.from(...)` to satisfy Sharp's types and prevent potential runtime mismatch

**text.ts — `fs.readFileSync` crashed the entire export if a font file was missing**
- Added individual `try/catch` around each font read; on failure logs a warning and returns `canvasBuffer` unchanged (name overlay skipped gracefully)

**export/route.ts — Base64 fallback would produce 11–55 MB response body (Vercel cap: 4.5 MB)**
- Replaced fallback with a structured `503 { error, retryable: true }` response
- R2 is now treated as required for 4000×5000 exports; inline delivery is not viable at this resolution

**KonvaCanvas.tsx — Z-order bug: shadow rendered before reflection**
- Shadow was buried under the reflection layer, making it invisible when both were enabled
- Fixed render order: Backdrop → Reflection → Shadow → Subject → Effects → Transformer

**KonvaCanvas.tsx — `<Transformer>` handles were obscured by fog and name overlay**
- Transformer was mid-layer; fog and name overlay rendered on top, hiding resize handles
- Moved Transformer to be the last child in the Layer (always renders on top)

**KonvaCanvas.tsx — Side-by-side danger zone passed `scale` instead of `sideScale`**
- Stroke width and dash pattern in side-by-side right panel used full-width base scale
- Fixed to pass `sideScale` (accounts for half-width + zoom)

**store/index.ts — `nameSizePct` and `nameYFromBottomPct` not persisted or undoable**
- Both fields were missing from `persistPartialize` (lost on page reload) and `temporalPartialize` (not tracked in undo history)
- Added to both; also added to `UndoableState` type in types.ts

**exportSlice.ts + ExportPanel.tsx — `removeBatchItem` had no guard for in-flight items**
- Removing a `running` item orphaned it mid-export, causing counter/zip mismatch
- Slice now early-returns if `status === 'running'`; Remove button gets `disabled={item.status === 'running'}`

**ControlPanel.tsx — 5 icon-only reset buttons had no `aria-label`**
- `title` attribute is not reliably announced by screen readers
- Added `aria-label="Reset [Section] to defaults"` to each instance

**rate-limit.ts — X-Forwarded-For spoofing bypassed all rate limits**
- Was reading the leftmost (client-controlled) `x-forwarded-for` entry
- Now reads `x-vercel-forwarded-for` first (Vercel-trusted), falls back to rightmost XFF entry

**BackdropPanel.tsx — `generating` status phase had no inline feedback**
- The `generating` → `polling` transition (3–8s) showed nothing in the panel body
- Added inline `Loader2` + status text that shows for both `generating` and `polling` states

**ExportPanel.tsx — Completed batch items didn't show filename or offer re-download**
- `exportedFilename` was stored in the batch item but never rendered
- Now displayed as truncated text under the item label when `status === 'done'`

**BackdropPanel.tsx — `loadProject()` replaced all work silently**
- Calling it wiped subjects, backdrop, and name data with no confirmation
- Added `window.confirm` before executing the replacement

### MEDIUM Fixes

**KonvaCanvas.tsx — Arrow key nudge fired inside TEXTAREA and SELECT**
- Was only guarding against `INPUT`; textarea (backdrop prompt) and select were unblocked
- Added both to the exclusion list

**DangerZoneOverlay.tsx — CSS mask was entirely non-functional**
- `radial-gradient(transparent 0%, transparent 100%)` → fully transparent mask → no effect
- Replaced with four real positioned `<div>` panels dimming the area outside the crop zone

**BackdropPanel.tsx — Drop zone silently rejected TIFF files on Windows/Chrome**
- TIFF files dragged from Windows/Chrome report `type: "application/octet-stream"` not `"image/tiff"`
- Added extension fallback: `|| /\.(tif|tiff)$/i.test(f.name)`

**ExportPanel.tsx — Queue buttons never disabled (silent no-op when no assets)**
- Buttons with no subject/backdrop selected did nothing with no feedback
- Added `disabled` conditions matching the actual queue requirements per button

**types/export.ts — `ExportQueueSummary` was missing `cancelled` field**
- `cancelled` items existed in `BatchStatus` but weren't counted, causing `total ≠ sum of fields`
- Added `cancelled: number` and wired the accumulator

**uiSlice.ts — `Date.now()` toast ID caused Sonner deduplication on rapid calls**
- Two toasts within 1ms shared the same ID and the second replaced the first
- Replaced with a module-level incrementing `_toastSeq` counter

**filesSlice.ts — `prevSubject` selected `N-2` when `activeSubjectId` was stale**
- `findIndex` returning `-1` → `(-1 - 1 + N) % N = N - 2` (wrong item)
- Added stale-ID guard for both `prevSubject` and `nextSubject`

**store/index.ts — `leftTab` and `showSafeArea` not persisted across reloads**
- Tab selection and safe-area toggle reset silently on every page load
- Added both to `persistPartialize`

**r2/presign/route.ts — `new URL(origin)` unguarded, crashes on malformed Origin header**
- Malformed Origin → `TypeError` → unhandled 500 instead of clean 400/403
- Wrapped in try/catch, returns 403 on parse failure

**analyze-reference/route.ts — No MIME type validation or size limit on imageDataUrl**
- Any content type forwarded to Gemini; no cap on payload size
- Added 10 MB size guard + allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

**generate-backdrop/route.ts + analyze-reference/route.ts — Env var names leaked in errors**
- Error messages included `FAL_KEY` and `GEMINI_API_KEY` verbatim
- Replaced with generic "AI image generation service is not configured." / "AI analysis service is not configured."

**templates/route.ts — Template name had no max-length validation**
- Unbounded name could inflate list query response payloads
- Added 200-character limit with a 400 response

**projects/route.ts — `request.json()` in POST not wrapped in try/catch**
- Malformed body threw `SyntaxError` → unhandled 500
- Wrapped, returns 400 "Invalid request body."

**projects/route.ts + [projectId]/route.ts — Raw Supabase error messages returned to client**
- Table/column names leaked in error responses
- All database errors now logged server-side; generic messages returned to client

**SessionResumeDialog.tsx — Showed wall-clock time, not relative session age**
- "9:30 PM" from last night is misleading on a morning reload
- Added `formatSessionAge()` returning e.g. "3 hours ago", "1 day ago"

**TemplatesPanel.tsx — Template delete fired immediately with no confirmation**
- One click permanently deleted a template
- Added `window.confirm` before firing the delete request

**EmptyState.tsx — Said "Files tab" but the tab is labeled "Subjects"**
- Stale copy confused new users
- Updated to "Subjects tab"

### LOW Fixes

**pipeline.ts — `compressionLevel: 9` was a batch throughput bottleneck**
- Maximum zlib compression adds 2–5s per image; saves only 5–10% over level 6
- Changed to `compressionLevel: 6`

**pipeline.ts — `reflectionSizePct` not clamped in the `comp` object**
- `undefined` or `NaN` would silently disable reflection; fixed with explicit clamp

**BackdropPanel.tsx + ExportPanel.tsx — Unicode `⟳` spinner renders off-center**
- `animate-spin` on inline text character spins around a non-centered pivot cross-browser
- Replaced with `<Loader2 className="h-3.5 w-3.5 animate-spin" />` (lucide-react)

**ToastBridge.tsx — All store toasts were neutral regardless of severity**
- `showToast` gained optional `type?: 'error' | 'success' | 'info'`
- ToastBridge now routes to `toast.error()` / `toast.success()` / `toast()` accordingly

**env.ts — `getR2Env()` uncached; logged `console.warn` on every request**
- Added module-level `_r2EnvCache`; warn fires only once per instance

**export/route.ts — No timeout wrapper on compositor pipeline**
- A hung Sharp pipeline would run until Vercel's 300s hard kill with no structured response
- Added `Promise.race` with 270s timeout → returns 503 `{ retryable: true }` on expiry

**projects/route.ts + [projectId]/route.ts — Missing `maxDuration` export**
- Routes defaulted to 10s plan limit; explicit `export const maxDuration = 10` added

### Verification
- `npm run lint` — 0 violations
- `npx tsc --noEmit` — 0 errors
- `npm run build` — 0 errors, 12 routes compiled

---

---

## [Unreleased] — Branch: `feature/compomate-full-implementation`

### Session: 2026-03-07 — Codex (GPT-5)

#### Planned action item — dual-person composite support
- Added requested follow-up work for CompoMate: support using two source images for a single generated/composited image so the final output can include two people.
- Intended product behavior:
  - allow selecting or uploading two subject images for one composition
  - place and adjust each person independently in the canvas
  - preserve both subjects through export/generation
  - store the two-subject setup in project/template state so it can be reopened later
- Main implementation areas likely affected:
  - asset and project data model
  - subject selection/upload UI
  - canvas controls and per-subject transforms
  - export/compositing pipeline
  - batch/template/session persistence

### Session: 2026-03-07 — Claude (claude-opus-4-6) — Final Assembly

#### All 5 batches complete — ready for merge

**Branch status:** Clean build (0 TS errors, 12 routes). 15+ commits. Ready for merge to `main`.

**What was built (cumulative):**

| Area | Before (Codex MVP) | After (This Branch) |
|------|---------------------|---------------------|
| `page.tsx` | 2345 lines (monolith) | 38 lines (composition root) |
| `api/export/route.ts` | 731 lines (monolith) | ~184 lines (orchestrator) |
| Components | 0 (all inline) | 15+ in `src/components/` |
| Types | Inline in page.tsx | 7 files in `src/types/` |
| State mgmt | 31 `useState` calls | Zustand + zundo (6 slices, undo/redo, persist) |
| Canvas | Plain `<img>` + CSS | react-konva (zoom/pan, Transformer, drag) |
| Pose detection | Pixel centroid only | MediaPipe WASM 33-keypoint + centroid fallback |
| Reflection | Uniform blur | 5-layer progressive blur |
| Edge effects | None | Defringe + light wrap |
| Upload | FormData (4.5MB limit) | Cloudflare R2 presigned URLs (500MB) |
| Export output | 1200-2400px (too small) | Always 4000×5000 @ 300 DPI |
| Color mgmt | None | ICC sRGB on all inputs/outputs |
| Keyboard | None | ←→ files, Cmd+Z/Y, Cmd+E, Cmd+S, ? overlay, arrow nudge |
| Name entry | Basic inputs | Paste auto-split, sticky last name, tab-flow, font preview |
| Backdrops | Flux only | Flux + Ideogram v2 + Gemini Vision reference photo |
| Templates | None | Save/load/download JSON (Supabase) |
| Sessions | None | localStorage persist + resume dialog |
| Analytics | None | Sentry + PostHog + Vercel Analytics/SpeedInsights |
| UI framework | Custom CSS classes | shadcn/ui + lucide-react + Inter font |
| Schema | 1 JSONB table | 4 purpose-built tables with RLS + indexes |
| Security | Headers only | Full CSP, env validation, usage logging |

**Manual actions required before deploy:**

| Priority | Action | Where |
|----------|--------|-------|
| 🔴 Critical | Rotate `FAL_KEY` (exposed: `c4099f61-...`) | [fal.ai dashboard](https://fal.ai/dashboard/keys) |
| 🔴 Critical | Rotate `GEMINI_API_KEY` (exposed: `AIzaSy...`) | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| 🟡 Required | Create R2 API token → paste into `.env.local` | Cloudflare Dashboard → R2 → Manage R2 API Tokens |
| 🟡 Required | Apply Supabase migration | `supabase db push` or paste SQL from `supabase/migrations/20260307_compomate_full_schema.sql` |
| 🟢 Optional | Set Sentry DSN in `.env.local` | Sentry dashboard → Project Settings |
| 🟢 Optional | Set PostHog key in `.env.local` | PostHog dashboard → Project Settings |

---

### Session: 2026-03-07 — Claude (claude-sonnet-4-6) — Batch 5C

#### Batch 5C — Supabase schema, security hardening, next.config.ts
**Commit:** `feat: 4-table Supabase schema, security headers/CSP, remotePatterns, usage logging`
- `supabase/migrations/20260307_compomate_full_schema.sql`: 4 tables (sessions, templates, backdrops, usage_logs), RLS policies (service_role_all), indexes on session_token + created_at, updated_at triggers; apply via `supabase db push`
- `.env.example`: complete variable inventory with placeholders — added NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SENTRY_AUTH_TOKEN; all R2/AI/analytics keys now have `<placeholder>` values
- `.env.local`: added `⚠️ NEVER commit this file` warning at top
- `src/lib/server/env.ts`: R2 removed from REQUIRED_VARS (graceful degradation — `getR2Env()` now logs `console.warn` instead of silently returning null); Sentry/PostHog added as optional fields to `EnvConfig`; Supabase URL resolver checks both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
- `next.config.ts`: added `serverExternalPackages: ['sharp']`; added `fal.media` to remotePatterns; upgraded CSP from broad `connect-src https:` to explicit domain list (PostHog, Sentry, fal, Gemini, R2); added `font-src 'self' data:`; added `cdn.jsdelivr.net` to worker-src; added `/api/(.*)` route with `X-Robots-Tag: noindex`; preserved existing Sentry wrapping and PostHog rewrites from Batch 5B
- `src/app/api/export/route.ts`: `sessionToken?: string` added to ExportRequest; `startTime = Date.now()` captured at handler entry; fire-and-forget usage log to `compomate_usage_logs` via `getSupabaseAdminClient()` after pipeline completes — never blocks response
- ⚠️  Key rotation required: `FAL_KEY` (real key in .env.local: `c4099f61-...`) and `GEMINI_API_KEY` (real key: `AIzaSy...`) were committed by Codex in an earlier batch. Rotate both keys immediately: fal.ai dashboard → API Keys; Google AI Studio → API Keys.
- Build: ✓ 0 TypeScript errors, 12 routes

---

### Session: 2026-03-06 — Claude (claude-sonnet-4-6) — Batch 5B

#### Batch 5B — Analytics + UI polish
**Commit:** `feat: Sentry + PostHog + Vercel Analytics, per-section reset buttons, next/image, Inter font`
- `sentry.client.config.ts` — Sentry browser init with replays (session 0%, error 50%)
- `sentry.server.config.ts` — Sentry server init (tracesSampleRate 0.1)
- `sentry.edge.config.ts` — Sentry edge init
- `next.config.ts`: `withSentryConfig` wrapper; PostHog reverse proxy rewrites (`/ingest/*`); `images.formats` (avif/webp) + `remotePatterns` for fal.media, fal.run, r2.cloudflarestorage, storage.googleapis.com
- `src/lib/client/posthog.ts` (new): lazy-init PostHog with `capture_pageview: false`, `capture_pageleave: true`
- `src/components/analytics/PostHogProvider.tsx` (new): `'use client'` wrapper — inits PostHog on mount, captures `$pageview` on pathname change
- `src/app/layout.tsx`: Added `Analytics` + `SpeedInsights` (Vercel), `PostHogProvider`, `Inter` font (CSS var `--font-inter`), preconnect hints for `vitals.vercel-insights.com` + `us.i.posthog.com`
- `src/components/panels/ControlPanel.tsx`: `RotateCcw` (lucide) reset buttons on all 5 sections — Placement (xPct, yPct, subjectHeightPct), Shadow (all 5 shadow fields), Reflection (all 4 reflection fields + enabled), Blend Helpers (legFade + fog fields), Name Overlay (nameSizePct + nameYFromBottomPct via store setters)
- `src/components/workspace/EmptyState.tsx`: Upgraded with `ImagePlus` / `Users` icons (lucide), two-line copy, pulsing icon animation, brand-colored border
- `.env.local` + `.env.example`: Added Sentry + PostHog placeholder vars
- Build: ✓ 0 TypeScript errors, 12 routes

---

### Session: 2026-03-07 — Claude (claude-sonnet-4-6) — Batch 5A

#### Batch 5A — Backdrop library, templates, session management
**Commit:** `feat: backdrop tabs (Ideogram v2 + Gemini Vision), templates, session resume`
- `BackdropPanel.tsx`: Full rewrite — 3 tabs (Upload / AI Generate / Reference Photo)
  - Upload tab: drag-and-drop zone, 2-col thumbnail grid with hover delete, active border `#6367FF`, R2 background upload via `uploadBlobToR2`
  - AI Generate tab: Flux sub-section (prompt + style hint + aspect) + Ideogram v2 sub-section (prompt + style dropdown: Realistic / Design / Render 3D / Anime)
  - Reference Photo tab: upload reference image → Gemini Vision → editable prompt → Generate with Flux
  - Shared `runFalGeneration()` helper used by all three generation flows
- `api/generate-backdrop/route.ts`: Added `model` param (`flux` | `ideogram`); `submitIdeogramJob()` submits to `fal-ai/ideogram/v2` with `style_type`, `aspect_ratio: 4:5`, `rendering_speed: BALANCED`; poll handler accepts `model` query param
- `api/analyze-reference/route.ts` (new): Gemini 2.0 Flash Vision → backdrop prompt; rate-limited; returns `{ prompt: string }`
- `api/templates/route.ts` (new): GET / POST templates; session_id managed as httpOnly cookie; stores in `compomate_templates` Supabase table
- `api/templates/[id]/route.ts` (new): GET / DELETE single template; session scoped
- `TemplatesPanel.tsx` (new): Save dialog (Cmd+S via `compomate:save-template` event); list with Load / JSON↓ / Delete; Import JSON; Download JSON
- `src/lib/client/sessionStorage.ts` (new): `saveSession` / `loadSession` / `clearSession` localStorage helpers
- `SessionResumeDialog.tsx` (new): Shows on startup if saved session < 24h; Resume loads jobName into store
- `src/app/page.tsx`: Added `<SessionResumeDialog />` + `<TemplatesPanel />` in right panel
- `src/lib/store/types.ts` + `backdropSlice.ts`: Added `updateBackdrop(id, patch)` action for R2 key patching
- `supabase/migrations/20260307_create_compomate_templates.sql` (new): `compomate_templates` table + index + updated_at trigger
- Build: ✓ 0 TypeScript errors, 11 routes

---

### Session: 2026-03-07 — Codex (GPT-5)

#### Shareable run summary added
- Added `LATEST_RUN_SUMMARY.md` at repo root as a handoff document for another developer or AI.
- It captures:
  - the completed scope of the audit-fix run
  - product decisions made during implementation
  - major files touched and why
  - verification performed
  - production deployment URLs and commit identifiers
  - what future developers should update when behavior changes

#### Commit + deploy handoff preparation
- Final implementation pass is complete and verified in the working tree.
- Ready to commit the audited-fix set on `main` and push it so the linked Vercel project can build from the committed state.
- Latest verification state before commit:
  - `npm run lint` passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
  - `npm audit --omit=dev` passed
  - browser smoke confirmed left-rail tabs, visible template-import validation toast, bracket file navigation, and canvas-only arrow-key nudging

#### Final cleanup complete — route/runtime and low-risk code hygiene
- `src/app/api/generate-backdrop/route.ts` now exports `maxDuration = 60` so the inline poll path has a safe serverless time budget.
- `src/app/api/export/route.ts` now uses `waitUntil()` from `@vercel/functions` for usage-log writes instead of an untracked fire-and-forget async IIFE.
- `src/lib/client/mediapipe.ts` now documents the current `as any` casts with a direct TODO pointing at upstream MediaPipe typings.
- `src/lib/compositing/pipeline.ts` no longer carries the stale commented pose-analysis block and the step numbering/comments now match the actual pipeline.
- `.env.example`, `README.md`, and `DEVELOPER_HANDOFF.md` no longer list the vestigial `FAL_MODEL` variable.
- `src/lib/client/utils.ts` no longer has a mid-file import; `clamp` is imported with the rest of the module header.
- Final verification for the full pass:
  - `npm run lint` passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
  - `npm audit --omit=dev` passed (`0` vulnerabilities)
  - repo scan confirmed the `FAL_MODEL` placeholder is gone from current runtime docs/config
  - local production export smoke still succeeds after the route changes (`Job-Alexandria-Rivera-0001.png`, inline PNG fallback path working as expected without R2)

#### Phase 4 complete — UI/state cleanup + toast bridge
- Added `src/components/layout/LeftSidebar.tsx` and converted the left rail to real `Subjects` / `Backdrops` tabs using the existing `leftTab` store state instead of the prior stacked layout.
- Added `src/components/layout/ToastBridge.tsx` and rewired the store-backed toast path so `showToast()` now reaches the visible Sonner UI instead of silently updating dead state.
- Simplified UI toast state in `src/lib/store/types.ts` and `src/lib/store/slices/uiSlice.ts`:
  - removed the old timeout bookkeeping
  - now emits discrete toast events with `{ id, message, durationMs }`
  - `clearToast()` is used by the new bridge after dispatching to Sonner
- `src/components/layout/AppHeader.tsx` now surfaces undo/redo affordances with disabled states and counts via the existing temporal selectors.
- `src/components/panels/ControlPanel.tsx` now has a top-level `Reset All` control that resets visual composition controls, including name overlay size/position defaults.
- `src/components/panels/ExportPanel.tsx` now wires `removeBatchItem()` into the batch list so queued items can be removed individually.
- `src/components/panels/BackdropPanel.tsx` now calls `resetGeneration()` before starting a new AI backdrop request so stale queue/error state is cleared between runs.
- `src/components/layout/ShortcutsOverlay.tsx` now consumes the shared `useShowShortcuts()` selector rather than reading raw store state directly.
- Review gate after this chunk:
  - `npx eslint` on all touched layout/store/panel files passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
  - dead selector/action scan confirmed the previously orphaned selector/action set is now wired into live UI
  - real-browser smoke on the local production build confirmed:
    - the left rail shows real `Subjects` / `Backdrops` tabs
    - invalid template JSON now surfaces a visible toast with the validation error

#### Phase 3 complete — interaction safety + template validation
- `src/lib/client/useKeyboardShortcuts.ts` now uses `[` / `]` for file navigation so the arrow keys are reserved for direct canvas nudging.
- `src/types/shortcuts.ts` was updated to match the new keyboard behavior and now documents both 1px and Shift+10px nudges.
- `src/components/panels/FilePanel.tsx` no longer suppresses the exhaustive-deps warning for auto-placement; the effect now tracks its real dependencies and guards against stale async resolution with cancellation.
- `src/components/panels/TemplatesPanel.tsx` now validates imported template JSON with `zod` instead of unchecked `JSON.parse(... as any)`, and malformed files fail with a clear import error.
- Review gate after this chunk:
  - `npx eslint src/lib/client/useKeyboardShortcuts.ts src/types/shortcuts.ts src/components/panels/FilePanel.tsx src/components/panels/TemplatesPanel.tsx` passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
  - follow-up browser verification with seeded subject/backdrop assets confirmed:
    - `]` changes the active subject file
    - `Shift+ArrowRight` updates persisted `composition.xPct` from `50` to `51`, so arrow keys are staying on canvas nudge instead of also triggering file navigation

#### Phase 2 complete — shared name overlay sizing + real font metrics
- Reworked `src/lib/shared/name-overlay.ts` so the shared SVG builder now honors:
  - `sizePct`
  - `yFromBottomPct`
  - selected font pair families
  - measured text widths for centered first/last-name layout
- Added font-metric parsing with `opentype.js` and a minimal local type declaration in `src/types/opentype-js.d.ts`.
- The name overlay layout no longer uses a fixed gap around center for all fonts; it now centers the full visual name block using measured glyph bounds from the actual bundled TTFs when available, with a bounded fallback estimate when font data is unavailable.
- `src/lib/compositing/text.ts` now measures the selected TTF files from disk and passes those metrics into the shared SVG builder before rasterizing via `@resvg/resvg-js`.
- `src/components/workspace/KonvaCanvas.tsx` now loads the same font assets for preview, embeds the real font files in the SVG data URL, and passes matching text metrics into the preview overlay so preview/export spacing stays aligned.
- Review gate after this chunk:
  - `npx eslint src/lib/shared/name-overlay.ts src/lib/compositing/text.ts src/components/workspace/KonvaCanvas.tsx src/types/opentype-js.d.ts` passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
  - local production export smoke re-rendered `output/playwright/export-name-classic.png` and `output/playwright/export-name-modern.png`
  - manual image review confirmed the classic and modern font pairs render distinctly and the first/last-name block no longer overlaps

#### Phase 1 complete — canvas preview fidelity + view controls
- Rebuilt `src/components/workspace/KonvaCanvas.tsx` so the live preview now renders:
  - name overlay SVG above the composite
  - shadow layer with gradient ellipse + blur
  - reflection layer honoring size, position, opacity, and blur controls
  - leg fade in the preview subject rendering
  - fog blend overlay on the floor
- Added intuitive global view controls in `src/components/layout/AppHeader.tsx`:
  - `Compare` toggles side-by-side raw subject vs composite preview
  - `Crop Guides` toggles the existing 4x6 / 5x7 overlay state
- Browser smoke on a local production build confirmed:
  - single-view composite shows shadow, fog, leg fade, crop guides, and name overlay together
  - compare mode now fits and centers both panes correctly after a follow-up fix to stage scaling math
- Review gate after this chunk:
  - `npm run lint -- src/components/workspace/KonvaCanvas.tsx src/components/layout/AppHeader.tsx` passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
  - focused diff review and dead-code scan on touched files were clean
- Browser console noise during smoke remains environment-related, not caused by this chunk:
  - local `_vercel/insights` / `_vercel/speed-insights` 404s in `next start`
  - expected `/api/r2/presign` 503s with local R2 env unset
  - existing CSP block against the remote MediaPipe model URL

#### UX defaults chosen for audit-fix implementation
- User delegated the open behavior choices to the most intuitive defaults for operators.
- Chosen defaults for the implementation pass:
  - file navigation will move to `[` and `]`, leaving arrow keys dedicated to direct subject nudging on canvas
  - the left rail will become real `Subjects` / `Backdrops` tabs instead of keeping the current stacked layout with dead `leftTab` state
  - `Reset All` behavior will reset composition controls only, not names/export style/session metadata

#### Functional audit review + implementation planning
- Read the current audit findings and re-read `changelog.MD` to ground the next pass in the actual merged repo state rather than the earlier batch notes.
- Re-verified the highest-risk findings directly in code:
  - `src/components/workspace/KonvaCanvas.tsx` still lacks preview rendering for name overlay, shadow, fog, leg fade, and full reflection controls.
  - `src/lib/shared/name-overlay.ts` still hardcodes font size, vertical position, and system font families.
  - `src/lib/compositing/text.ts` still ignores `fontBasePath`, `fontPairId`, `sizePct`, and `yFromBottomPct`.
  - `src/lib/client/useKeyboardShortcuts.ts` still conflicts with the Konva arrow-key nudge handler.
  - `src/components/panels/FilePanel.tsx` still suppresses the stale-effect dependency warning.
  - `src/components/panels/TemplatesPanel.tsx` still imports JSON with unchecked `JSON.parse(... as any)`.
- Confirmed store/UI cleanup scope before planning:
  - `showSideBySide` and `showDangerZone` are implemented in the canvas but have no UI controls.
  - `leftTab` is currently orphaned and not consumed anywhere.
  - undo/redo selectors are present but not surfaced in the header.
- Built a dependency-ordered implementation plan for all 18 findings, grouped into: canvas fidelity, export fidelity, interaction/input safety, store/route cleanup, and low-risk code hygiene.

#### Full repo change inventory loaded
- Loaded the entire implemented repo delta from baseline snapshot commit `4de04a0` through current `HEAD` on `main`, rather than only inspecting local worktree changes.
- Verified current branch state:
  - branch: `main`
  - worktree: clean
  - latest local/remote commit: `50d1c49` (`fix: always render Analytics + SpeedInsights (remove conditional guard)`)
- Repo-wide delta from `4de04a0..HEAD`: 99 files changed, 20,333 insertions, 4,241 deletions.
- Confirmed the implementation history is already merged into `main` via merge commit `9f77994` from `feature/compomate-full-implementation`, followed by the analytics/speed-insights fix on top.
- High-level loaded areas:
  infrastructure and dependency expansion, typed domain models, Zustand/zundo store, compositing pipeline, R2 upload/download services, Konva canvas, MediaPipe pose estimation, AI backdrop generation, templates/session resume, analytics/observability, Supabase schema work, and the current browser/runtime hardening layer.

#### Batch 5 browser/runtime hardening — real-browser crash fix + CSP/runtime cleanup
- `src/lib/store/selectors.ts`, `src/lib/store/slices/exportSlice.ts`, `src/lib/store/types.ts`, and `src/components/panels/ExportPanel.tsx` — removed the unstable derived queue-summary subscription that was returning a fresh object every render and crashing the app on first load under React 19’s external-store checks.
- `next.config.ts` — updated the CSP to match the runtime the app actually uses:
  `connect-src` now allows `blob:` for local export-source fetches, `worker-src` allows `blob:`, and `script-src` includes `wasm-unsafe-eval` so MediaPipe can compile its local WebAssembly runtime without opening generic production `unsafe-eval`.
- `src/lib/client/mediapipe.ts` plus vendored assets under `public/vendor/mediapipe/wasm/` — moved the MediaPipe runtime off the CDN path and into the repo so auto placement uses a local, version-matched WASM bundle instead of depending on external script hosting.
- `eslint.config.mjs` — excluded `public/vendor/**` from lint so vendored upstream runtime code does not pollute repo lint results.
- `src/app/layout.tsx` — gated Vercel Analytics and Speed Insights to actual Vercel runtime environments so local browser sessions stop emitting avoidable `_vercel/*` script errors.
- Real-browser verification with Playwright against local production build:
  confirmed the app loads cleanly, subject import works, MediaPipe graph initialization succeeds, backdrop import works, export completes successfully, and the first-export approval dialog appears. The remaining browser console error in the smoke path was the expected `503` from `/api/r2/presign` because R2 credentials are not configured in the local environment.
- Review gate after this chunk: `npm run lint` passed, `npm run build` passed, focused diff inspection matched the browser/runtime files, stub/dead-code scan on touched files returned clean, and `npm audit --omit=dev` reported 0 vulnerabilities.

#### Repository docs alignment
- Rewrote `README.md` so it reflects the current product surface instead of the old phased-build framing.
- Replaced `.env.example` with an environment template that includes the current R2, AI, Supabase, and observability variables actually used by the app.
- Added a note at the top of `DEVELOPER_HANDOFF.md` marking it as historical and pointing future developers to `changelog.MD` and `README.md` for the current state.

#### Batch 5 persistence hardening — export race fix + snapshot references
- `src/app/api/export/route.ts` — removed the R2 upload race: exports now upload synchronously before returning a presigned download URL, and if R2 upload fails the route falls back to an inline data URL instead of returning a broken link.
- `src/lib/shared/project-snapshot.ts` and `src/lib/constants.ts` — introduced snapshot version `2` with backward-compatible validation for both v1 and v2 payloads; serialized assets can now store either inline `dataUrl` content or an `r2Key`.
- `src/components/panels/BackdropPanel.tsx` — upgraded project save/load to prefer `r2Key` references when assets are already in storage, fall back to inline data only when needed, replace the current subject/backdrop libraries instead of appending duplicates, and apply composition state once instead of redundantly replaying the same patch in a loop.
- `src/lib/client/utils.ts` and `src/app/api/r2/download/route.ts` — added the client/server path for loading previously stored R2-backed assets into the editor by resolving a presigned read URL, downloading the blob, and rebuilding local editor assets with the original `r2Key` preserved.
- `src/lib/store/types.ts`, `src/lib/store/slices/filesSlice.ts`, and `src/lib/store/slices/backdropSlice.ts` — added `replaceSubjects()` and `replaceBackdrops()` so project loads can cleanly reset asset libraries instead of layering restored files on top of the previous session.
- Review gate after this chunk: `npm run lint` passed, `npm run build` passed, focused diff inspection confirmed the export/persistence changes only, stub/dead-code scan on touched files returned clean, and `npm audit --omit=dev` reported 0 vulnerabilities.

#### Batch 5 asset pipeline completion — subject R2 upload + export source cleanup
- `src/components/panels/FilePanel.tsx` — completed subject-side background uploads to Cloudflare R2 after local file import so the app now treats subject assets the same way as backdrop assets: local editing stays immediate, while export can reuse uploaded originals when available.
- `src/lib/store/types.ts`, `src/lib/store/slices/filesSlice.ts`, and `src/types/files.ts` — added `updateSubject()` plus optional `r2Key` support on `Asset` so asynchronously uploaded subjects can be patched into store state without re-adding or reordering files.
- `src/components/panels/ExportPanel.tsx` — added a shared export-source resolver so export and batch export now prefer `subjectR2Key` / `backdropR2Key` and only fall back to data URLs when an asset has not finished uploading yet.
- `src/lib/shared/composition.ts` — corrected export profile descriptions to match the current product behavior: the app exports from the 4:5 master canvas and uses crop guides as framing aids, not true alternate-raster print exports.
- `src/components/layout/AppHeader.tsx` — replaced the stale `Phases 1-7 Build` badge with `Internal Tool` so the shell copy matches the clarified project role.
- Review gate after this chunk: `npm run lint` passed, `npm run build` passed, focused diff inspection matched the intended asset/export files, stub/dead-code scan on touched files returned clean, and `npm audit --omit=dev` reported 0 vulnerabilities.

#### Batch 5 workflow integration — templates + session management hardening
- Confirmed the new Phase 5 UI pieces were already wired into the page: `TemplatesPanel` is in the right rail and `SessionResumeDialog` is mounted near the app shell.
- Fixed the session metadata design so it no longer collides with Zustand persist storage: added `SESSION_RESUME_STORAGE_KEY` and moved `src/lib/client/sessionStorage.ts` onto that dedicated key.
- `src/components/layout/SessionResumeDialog.tsx` — upgraded the dialog from a dead prompt into an actual session-control layer:
  it now saves lightweight session metadata on relevant workspace changes, explains that workspace settings were already auto-restored, supports `Start fresh` by clearing persisted store state and reloading, and reapplies saved export/name/font/lock settings on `Resume`.
- `src/app/api/templates/route.ts` and `src/app/api/templates/[id]/route.ts` — added per-IP rate limiting and production-safe session cookies (`secure` in production) so the templates API is closer to the same hardening standard as the other routes.
- `supabase/migrations/20260307_create_compomate_templates.sql` — hardened the templates schema with `pgcrypto`, explicit `public.` schema usage, a compound session/update index, and RLS enabled on the table.
- Review gate after this chunk: `npm run lint` passed, `npm run build` passed, focused diff inspection stayed limited to the templates/session files, stub/dead-code scan returned clean on the touched files, and `npm audit --omit=dev` reported 0 vulnerabilities.

#### Batch 4 stabilization gate
- Fixed the new Konva canvas path so the branch returned to a clean `npm run lint` and `npm run build` baseline.
- `src/components/workspace/KonvaCanvas.tsx` — moved the shared stage renderer out of the component body, replaced the image-loading hook with a safer loaded-image record, and kept drag/zoom/reflection props explicit.
- `src/components/layout/ShortcutsOverlay.tsx` — replaced array-index keys with stable keys derived from shortcut metadata.
- `src/lib/client/useKeyboardShortcuts.ts` — replaced the ternary undo/redo expression with explicit branching.
- `src/components/panels/FilePanel.tsx`, `src/lib/client/utils.ts`, `src/lib/compositing/pipeline.ts`, `src/lib/store/slices/filesSlice.ts` — removed dead imports/unused parameters.
- `src/lib/store/slices/uiSlice.ts` — clamped persisted canvas zoom in the setter instead of trusting callers.
- Review gate after this chunk: `npm run lint` passed, `npm run build` passed, diff inspection stayed scoped to the stabilization files, stub/dead-code scan on touched files returned clean, and `npm audit --omit=dev` reported 0 vulnerabilities.
- During the review pass, identified additional in-progress Batch 5 work already present in the repo for templates, session resume, analytics, and new API routes; next work will finish and wire those features rather than rebuild parallel implementations.

#### Scope clarification + phase completion kickoff
- User clarified that `portal-slideshow` is a separate project and should not be integrated into `compomate`.
- User clarified that `compomate` is currently an internal tool, but should be built cleanly enough to support future reuse by other companies.
- New directive for this pass: finish the remaining phases without knowingly temporary work, keep `changelog.MD` updated continuously, and apply strong review/verification after each major implementation chunk.
- Began a fresh audit of the current branch state to determine which planned phases remain incomplete after the recent Batch 4 work.

### Session: 2026-03-06 — Claude (claude-sonnet-4-6) — Batch 4B react-konva + MediaPipe

#### Batch 4B — react-konva canvas + MediaPipe pose estimation
**Commit:** `feat: react-konva canvas — zoom/pan, Transformer, arrow nudge, MediaPipe pose estimation`
- `src/lib/client/mediapipe.ts` — MediaPipe WASM 33-keypoint pose (GPU delegate, pixel centroid fallback)
- `src/lib/client/autoPlacement.ts` — MediaPipe → centroid fallback auto-placement
- `Canvas.tsx` split into Canvas.tsx (outer shell, ResizeObserver) + KonvaCanvas.tsx (Konva implementation)
- KonvaCanvas: backdrop + subject (draggable + Transformer) + reflection layers
- Cmd+scroll zoom (0.25x–4x), arrow key nudge (0.1%/1%), drag-to-reposition
- Side-by-side toggle (raw subject on white vs full composite)
- Danger zone crop zone overlays (4×6 red, 5×7 orange dashed Rects in logical coords)
- Auto-placement wired to FilePanel subject selection via `computeAutoPlacement`

---

### Session: 2026-03-06 — Claude (claude-sonnet-4-6) — Batch 4A Export Pipeline

#### Batch 4A — Export pipeline upgrade
**Commit:** `feat: export pipeline — maxDuration=300, R2 I/O, 4000x5000 output, queue UI, approval gate`
- Rewrote api/export/route.ts (731→~150 lines) using runCompositorPipeline
- maxDuration=300 (Vercel Fluid Compute), waitUntil for non-blocking R2 upload
- JSON body (not FormData) — R2 keys preferred, data URL fallback
- Always 4000×5000 output at 300 DPI
- File naming: [Job]-[First]-[Last]-[0001].png from buildExportFilename()
- Queue summary bar (✓/●/○/✗ counts), per-item status icons
- Export toast (sonner, 4s), approval gate dialog after first export
- Lock settings toggle (shadcn Switch + lucide Lock/Unlock icon)
- File naming live preview in export settings
- Keyboard shortcut Cmd+E wired via compomate:export custom event
- Installed @vercel/functions for waitUntil
- Added `<Toaster />` to root layout (src/app/layout.tsx)

---

### Session: 2026-03-06 — Claude (claude-sonnet-4-6) — Batch 4C

#### Batch 4C — Keyboard shortcuts + name entry UX
**Commit:** `feat: keyboard shortcuts hook, paste auto-split, sticky last name, tab-flow, font preview`
- `src/lib/client/useKeyboardShortcuts.ts` — global keydown hook: ← → file navigation, Cmd+Z undo, Cmd+Shift+Z redo, Cmd+E export, Cmd+S template, ? overlay; uses exported `undo`/`redo` imperatives from store (avoids useCallback anti-pattern)
- `src/components/layout/KeyboardShortcutsProvider.tsx` — thin `'use client'` wrapper that calls the hook; wraps page content in page.tsx
- `src/app/page.tsx` — wrapped root content with `<KeyboardShortcutsProvider>`
- `src/components/layout/ShortcutsOverlay.tsx` — upgraded to shadcn Dialog (base-ui); controlled via `open={showShortcuts}` + `onOpenChange`; renders SHORTCUTS array in a CSS Grid two-column layout (description | kbd badges); maps arrow keys to `←→↑↓` and modifiers to `⌘⇧⌥`
- `src/components/panels/NameEntryPanel.tsx` — clipboard paste auto-split (space detection, calls `pasteAutoSplit`); tab-flow refs (`firstNameRef`/`lastNameRef`) — Tab on lastName advances to next subject; sticky last name upgraded from checkbox to shadcn Switch with Pin icon and `title` tooltip; lastName input gets `border-[#6367FF]` when sticky; `clearForNextFile` effect on `activeSubjectId` change (skips initial load); font preview div using FontFace API loads pair fonts and renders first/last name live; font pair selector (Classic/Modern buttons) calls `setFontPair`; name overlay toggle converted to Switch
- `tsconfig.json` — bumped target from `ES2017` → `ES2018` (pre-existing: `/s` dotAll regex flag in `api/export/route.ts` required ES2018)
- `src/app/api/export/route.ts` — pre-existing fix: `Buffer` → `new Uint8Array(buffer)` for fetch `body` (BodyInit compat with updated lib types)
- `src/components/workspace/KonvaCanvas.tsx` — created stub component (pre-existing missing file referenced by Canvas.tsx); accepts `containerWidth`/`containerHeight` props; renders placeholder until Konva stage is implemented
- Build: 0 TypeScript errors, 9 routes generated successfully

### Session: 2026-03-07 — Codex (GPT-5)

#### Repository alignment + changelog policy
- Restored the root changelog as `changelog.MD` after a failed case-only rename attempt removed the tracked `CHANGELOG.md` on this filesystem.
- Normalized the git-tracked path to `changelog.MD` with a two-step rename so future commits preserve the requested casing.
- Reconfirmed that this repository is `compomate`, not `portal-slideshow`.
- Reviewed `README.md`, `BACKLOG.md`, `DEVELOPER_HANDOFF.md`, `package.json`, recent git history, `src/app/page.tsx`, `src/components/workspace/Canvas.tsx`, and the main API routes under `src/app/api/`.
- Current repo role from the implemented code: a Next.js portrait compositing tool for dance/gymnastics style production workflows, including subject placement, backdrop management, fal.ai backdrop generation, cloud export, batch export, and optional Supabase project snapshots.
- Open clarification requested from the user: whether the pasted `portal-slideshow` v2.0 specification is only business context or an intended integration target for `compomate`.

### Session: 2026-03-06 — Claude (claude-sonnet-4-6) — Batch 3 Component Extraction

#### Batch 3 — page.tsx extraction into 11 components (Zustand store wired)
**Commit:** `feat: extract page.tsx into 11 focused components wired to Zustand store`
- Installed `immer` (was used by zustand middleware but missing from package.json)
- Extended `UISlice` in `src/lib/store/types.ts` — added `showSafeArea: boolean` and `setShowSafeArea(v: boolean)`
- Extended `src/lib/store/slices/uiSlice.ts` — implemented `showSafeArea` (default `true`) and `setShowSafeArea`
- Added `useShowSafeArea` selector to `src/lib/store/selectors.ts`
- Created `src/lib/client/utils.ts` — all client-side utility functions extracted from page.tsx: `makeId`, `wait`, `isImageFile`, `parseErrorText`, `dataUrlToBlob`, `svgToDataUrl`, `loadImageElement`, `canvasToBlob`, `fileToDataUrl`, `loadImageDimensions`, `fileToAsset`, `fileToBackdropAsset` (new), `dataUrlToAsset`, `dataUrlToBackdropAsset` (new), `filesToAssets`, `filesToBackdropAssets` (new), `collectImageFiles`, `analyzeSubjectPose`, `directionFromVector`, `detectBackdropLightDirection`, `isProjectSnapshot`, `prepareExportPayload` (kept for backward compat — signature changed to `(backdropUrl, subjectUrl, exportProfile)`), `buildDownloadFilename`; also exports `PoseAnalysis` type
- Created `src/components/layout/AppHeader.tsx` — reads `jobName` from store, job name input, `?` shortcuts button
- Created `src/components/layout/ShortcutsOverlay.tsx` — maps `SHORTCUTS` array, closes on backdrop click
- Created `src/components/workspace/EmptyState.tsx` — typed `no-backdrop | no-subject | ready` states
- Created `src/components/workspace/DangerZoneOverlay.tsx` — 4x6 (red) and 5x7 (orange) crop zone overlays from `CROP_ZONES` constant
- Created `src/components/workspace/Canvas.tsx` — full canvas with backdrop letterboxing, drag (pointer events preserved exactly), shadow ellipse, reflection image, leg fade mask, floor fog, name overlay SVG, safe area box; all state from Zustand store; local state: `canvasSize`
- Created `src/components/panels/FilePanel.tsx` — subjects list, Add Files/Add Folder, thumbnails, remove; local `objectUrlsRef` for cleanup
- Created `src/components/panels/BackdropPanel.tsx` — backdrops list, upload, FAL AI generation with polling, Projects (Supabase) save/load/refresh; store for backdrop state, local state for generation UI and Supabase UI
- Created `src/components/panels/NameEntryPanel.tsx` — firstName/lastName inputs with paste-auto-split on multi-word paste, stickyLastName toggle, nameOverlay toggle
- Created `src/components/panels/ControlPanel.tsx` — Auto Assist (auto place+blend, auto shadow direction, Soft/Studio/Dramatic presets), Placement sliders, Shadow section (enable + 5 sliders), Reflection section (enable + 4 sliders), Blend Helpers (leg fade + fog); local `poseAnalysis` state for auto functions
- Created `src/components/panels/ExportPanel.tsx` — name style selector, export profile selector, safe area toggle, Export Final PNG button, Batch Queue (queue pair/subject×all/backdrop×all, batch list, run/cancel/clear); local `isExporting`, `isBatchRunning`, `batchAbortRef`, `batchRequestAbortRef`
- Rewrote `src/app/page.tsx` to 38 lines — composition root only: imports panels, dynamic Canvas (ssr:false), 3-column grid layout (320px | flex | 360px)
- Build: 0 TypeScript errors, 0 ESLint errors, all 9 pages/routes generated successfully

### Session: 2026-03-06 — Claude (claude-sonnet-4-6)

#### Batch 2D — Zustand + zundo store
**Commit:** `feat: Zustand store with zundo undo/redo and persist session settings`
- Created `src/lib/store/types.ts` — all 6 slice interfaces + `AppState` + `UndoableState` in one file to eliminate circular dependencies
- Created `src/lib/store/slices/filesSlice.ts` — subjects array, activeSubjectId, add/remove/navigate (next/prev with wrap-around)
- Created `src/lib/store/slices/backdropSlice.ts` — backdrops array, activeBackdropId, AI generation state (status/prompt/model), resetGeneration
- Created `src/lib/store/slices/compositionSlice.ts` — CompositionState, exportProfileId, nameStyleId, fontPairId, lockSettings, applyBlendPreset (merges only keys present in BLEND_PRESETS constant)
- Created `src/lib/store/slices/namesSlice.ts` — firstName/lastName, stickyLastName, nameOverlay settings, pasteAutoSplit (first-whitespace split), clearForNextFile (respects sticky)
- Created `src/lib/store/slices/exportSlice.ts` — jobName, batchItems, exportCounter, approvalGiven, getQueueSummary() computed getter
- Created `src/lib/store/slices/uiSlice.ts` — tabs, modals, canvasZoom, showToast (clears previous timer before setting new one)
- Created `src/lib/store/index.ts` — combines all slices with `immer` + `temporal` (zundo, partializes to UndoableState, limit 50) + `persist` (localStorage, partializes session settings); exports `useStore`, `useTemporalStore`, `undo`, `redo`
- Created `src/lib/store/selectors.ts` — 30 selector hooks covering all slices; `useCanUndo` / `useCanRedo` / `useUndoCount` / `useRedoCount` via `useTemporalStore`
- Middleware stack: `persist(temporal(immer(slices)))` — persist is outermost, immer is innermost
- Persist key: `SESSION_STORAGE_KEY`; persists jobName, lockSettings, exportProfileId, nameStyleId, fontPairId, stickyLastName, nameOverlayEnabled, composition
- Undo/redo tracks: composition, nameStyleId, fontPairId, firstName, lastName — NOT files, backdrops, export queue, or UI state
- 0 TypeScript errors in all new store files

#### Batch 2E — Sharp pipeline refactor
**Commit:** `feat: Sharp compositing pipeline — progressive blur, light wrap, defringe, pure functions`
- Created `src/lib/compositing/` with 8 files, 7 pure async functions, zero side effects
- `types.ts` — `CompositorInput`, `CompositorOutput`, `PlacementResult`, `PoseMetrics` interfaces
- `normalize.ts` — `normalizeSubject` (RGBA sRGB PNG, EXIF rotation, pixel-count guard), `normalizeBackdrop` (cover-fit to 4000×5000; intentionally allows upscale so FAL AI 1024×1280 backdrops fill canvas)
- `placement.ts` — `calculatePlacement` (foot-anchor model: xPct/yPct drive bottom-centre of subject), `analyzeSubjectPose` (pixel-scan returning fractional PoseMetrics; lean via top/bottom centroid delta)
- `defringe.ts` — `defringeSubject` (morphological alpha erosion: per-pixel min-neighbour scan within radius, shaves colour-fringe ring without touching RGB)
- `reflect.ts` — `createReflection` (5-layer progressive blur: 2/6/12/20/32px at 0.9/0.7/0.55/0.35/0.15 opacity; feet-line detection zeroes above-feet rows; gradient fade × overall opacity; returns full 4000×5000 transparent canvas with reflection at placement-relative position)
- `lightwrap.ts` — `applyLightWrap` (backdrop crop → 32px blur wash → dilated-minus-original edge mask → multiply → composite at LIGHT_WRAP_STRENGTH)
- `text.ts` — `renderNameOverlay` (wraps existing `buildNameOverlaySvg`, no-ops when disabled or empty)
- `pipeline.ts` — `runCompositorPipeline` orchestrator: normalize → size → placement → leg-fade → defringe → lightwrap → reflection → backdrop composite (reflection, subject, fog SVG) → name overlay → 300 DPI PNG
- `index.ts` — public barrel re-export
- 0 TypeScript errors in compositing module; pre-existing backdropSlice.ts errors unaffected

#### Batch 2F — R2 upload service
**Commit:** `feat: R2 upload service — presigned URLs, client uploader, env validation`
- Created `src/lib/server/env.ts` — `validateEnv()` / `getEnv()` (cached) / `getR2Env()` (null-safe R2 check); detects placeholder values like `<generate-at-cloudflare-dashboard>`
- Created `src/lib/server/r2.ts` — S3-compatible R2 client; `getPresignedUploadUrl()`, `getPresignedDownloadUrl()`, `deleteR2Object()`; key generators `generateSubjectKey/BackdropKey/ExportKey()` with nanoid(8) + sanitization
- Created `src/lib/client/uploader.ts` — `uploadFileToR2()` and `uploadBlobToR2()`; XHR-based direct-to-R2 PUT with `onProgress` callback; presign request to `/api/r2/presign`
- Created `src/app/api/r2/presign/route.ts` — POST; validates purpose (`subject`/`backdrop`/`export`), MIME type (png/jpeg/tiff/webp), same-origin CORS; rate limited 100 req/min/IP; returns `{ uploadUrl, key, downloadUrl }`; graceful 503 if R2 creds missing
- Created `src/app/api/r2/delete/route.ts` — DELETE; key prefix guard (subjects/, backdrops/, exports/ only); rate limited 60 req/min/IP; graceful 503 if R2 creds missing
- Installed `nanoid` (pure ESM, ^5.x)
- 0 TypeScript errors
- **Note:** R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in `.env.local` still have placeholder values — generate at Cloudflare Dashboard → R2 → Manage R2 API Tokens

#### Batch 1C — Constants extraction
**Commit:** `feat: create src/lib/constants.ts`
- Created `src/lib/constants.ts` (302 lines) — single source of truth for all magic numbers
- Sections: export dimensions (always 4000×5000px, 300 DPI), crop safety zones, file limits, R2 config, backdrop generation, FAL AI models, canvas zoom/nudge, slider min/max bounds (15 controls), reflection, light wrap, MediaPipe, export toast, file naming with `buildExportFilename()`, font pairs, session storage keys, DB table names, color palette, layout dimensions, name overlay defaults, pose analysis constants, blend presets, shadow physics
- Found and captured constants from actual `page.tsx` scan (auto-placement formulas, light detection, fog tint, shadow gradient stops, etc.)

#### Batch 1B — Types extraction
**Commit:** `feat: extract types to src/types/`
- Created `src/types/index.ts` — barrel re-export
- Created `src/types/files.ts` — `Asset`, `PoseAnalysis`, `PreviewRect`
- Created `src/types/composition.ts` — re-exports `lib/shared/composition` + adds `CompositeSpec`, `NameOverlayConfig`, `FontPairId`, `FontPair`
- Created `src/types/backdrop.ts` — `BackdropAsset`, `BackdropGenerationStatus`, `BackdropGenerationState`
- Created `src/types/export.ts` — `BatchStatus`, `BatchItem`, `ExportQueueSummary`, FAL payload types + type guards
- Created `src/types/session.ts` — `SessionSettings`, `Template`
- Created `src/types/shortcuts.ts` — `ShortcutDef`, `SHORTCUTS` constant array
- 0 TypeScript errors in new files

#### Batch 1A — Infrastructure setup
**Commit:** `feat: infrastructure — R2 bucket, Google Fonts, shadcn/ui, all new dependencies`
- Created Cloudflare R2 bucket `compomate-uploads` (wnam / western North America) with CORS configured
- **⚠️ ACTION REQUIRED:** R2 S3-compatible API tokens must be created via Cloudflare Dashboard UI (R2 → Manage R2 API Tokens). Add `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` to `.env.local` manually.
- Downloaded 4 Google Fonts TTF files to `public/fonts/`: `GreatVibes-Regular.ttf` (91KB), `DancingScript-Regular.ttf` (51KB), `Montserrat-Bold.ttf` (48KB), `Oswald-Bold.ttf` (26KB)
- Installed 426 new packages — key additions: `konva`, `react-konva`, `zustand`, `zundo`, `@uppy/core`, `@uppy/tus`, `@uppy/react`, `@uppy/dashboard`, `@mediapipe/tasks-vision`, `@sentry/nextjs`, `posthog-js`, `@vercel/analytics`, `@vercel/speed-insights`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `lucide-react`, `react-hook-form`, `zod`
- Initialized shadcn/ui — installed components: `badge`, `button`, `dialog`, `dropdown-menu`, `input`, `separator`, `slider`, `sonner`, `switch`, `tabs`, `tooltip` → `src/components/ui/`
- Created `src/lib/utils.ts` with `cn()` utility (clsx + tailwind-merge)
- Build: ✓ compiled successfully

#### Baseline snapshot
**Commit:** `chore: baseline snapshot before full implementation`
- Preserved original Codex-built codebase state before any modifications
- Original: `page.tsx` (2345 lines), `api/export/route.ts` (731 lines), 6 npm dependencies

---

## [Codex Build] — Branch: `main`

### Session: 2026-03-05 — Codex Agent

#### Phase 1–7 Ship
**Commit:** `2c4466c` — "feat: phases 1-7 ship"
- Initial full implementation of CompoMate MVP
- Three-column dark layout (`#0D0D12` bg, `#13131A` panels)
- Subject drag-to-reposition with backdrop-relative coordinates
- Reflection system (flip + opacity fade + uniform blur)
- Shadow system (directional, elevation, stretch, blur controls)
- Fog/haze blend effect
- Leg fade gradient
- Name overlay preview in canvas (SVG, shared client/server)
- fal.ai Flux backdrop generation with request polling
- Export pipeline via Sharp (PNG, 300 DPI metadata)
- Batch export with ZIP download (JSZip)
- Batch cancel with AbortController
- Safe area overlay (dashed border for crop zone)
- Auto placement based on pixel centroid pose analysis
- Auto light direction detection from backdrop
- Blend presets (soft/studio/dramatic)
- Supabase project persistence with safety gate
- Security headers in `next.config.ts`
- Rate limiting on export route (in-memory)
- Input dimension guardrails (`MAX_INPUT_PIXELS`, `MAX_INPUT_EDGE_PX`)

#### Fix: fal.ai polling
**Commit:** `18fb5f7` — "fix: poll fal backdrop jobs until image is ready"
- Fixed backdrop generation to poll status URL until image is ready

#### Fix: Vercel payload limit
**Commit:** `1f1e6e6` — "fix: workaround vercel payload limit"
- Client-side image downscaling to fit under Vercel 4.5MB body limit
- ⚠️ Known issue: destroys print quality — will be replaced by R2 upload in feature branch

---

## Known Issues / Technical Debt (to be fixed in feature branch)

| Issue | Severity | Fix |
|-------|----------|-----|
| Export quality destroyed by client-side JPEG downscale | Critical | Replace with R2 presigned upload |
| Export output too small (1200–2400px, not 4000×5000) | Critical | Fix `EXPORT_PROFILES` dimensions |
| `page.tsx` is 2345 lines — entire app in one file | High | Extract to 15 components |
| No undo/redo | High | Add Zustand + zundo |
| No keyboard shortcuts | High | Implement shortcut system |
| No react-konva (uses plain `<img>`) | High | Migrate canvas |
| No MediaPipe (uses pixel centroid only) | Medium | Add WASM pose estimation |
| Reflection blur is uniform, not progressive | Medium | Add 5-layer progressive blur |
| No light wrap edge effect | Medium | Add Sharp pipeline step |
| No `maxDuration = 300` on API routes | Medium | Add Fluid Compute config |
| No Sentry / PostHog / Vercel Analytics | Medium | Add in root layout |
| In-memory rate limiter (process-local) | Low | Replace with Upstash Redis or KV |
| Supabase single table with JSONB blob | Low | Migrate to 4-table schema |

---

## Implementation Status — All Batches Complete

| Batch | Status | Workstreams |
|-------|--------|-------------|
| 1 — Foundation | ✅ Done | Infrastructure, types, constants |
| 2 — Core Services | ✅ Done | Zustand store, Sharp pipeline, R2 service |
| 3 — Components | ✅ Done | page.tsx → 15 components |
| 4 — Features | ✅ Done | Export pipeline, react-konva, keyboard, names |
| 5 — Polish | ✅ Done | Backdrop library, templates, sessions, analytics, schema, security |
| 6 — Ship | ⬜ Pending | Build clean ✓, merge to main, deploy to Vercel |

### Remaining for Batch 6
- Merge `feature/compomate-full-implementation` → `main`
- Rotate exposed API keys (FAL_KEY, GEMINI_API_KEY)
- Create R2 API token at Cloudflare Dashboard
- Apply Supabase migration (`supabase db push`)
- Deploy to Vercel (`vercel --prod` or auto-deploy on merge)
