# CompoMate — Agent Work Log

> This file is the persistent root changelog for this repo.
> Update it for every important investigation, code change, and commit.
> Format: newest entries at the top.

---

## [Unreleased] — Branch: `feature/compomate-full-implementation`

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

## Planned Work (Upcoming in this branch)

### Batch 2 — Core Services
- **WS-04** Zustand + zundo store (files, backdrop, composition, names, export, ui slices)
- **WS-05** Sharp pipeline refactor → `src/lib/compositing/` (9 pure functions, progressive blur, light wrap, ICC sRGB, withoutEnlargement, always 4000×5000)
- **WS-06** R2 upload service (presigned URLs, Uppy+tus client)

### Batch 3 — Component Extraction
- **WS-07** Extract `page.tsx` into 15 components across `src/components/layout/`, `src/components/panels/`, `src/components/workspace/`

### Batch 4 — Feature Build
- **WS-08+17** Export pipeline: maxDuration=300, waitUntil, R2 I/O, file naming, queue UI, approval gate
- **WS-09+10+13** Canvas: MediaPipe WASM, react-konva, danger zone overlay
- **WS-11+12** Keyboard shortcuts, name entry UX

### Batch 5 — Integration & Polish
- **WS-14+15+16** Backdrop library, templates, session management
- **WS-18+19** Analytics, UI polish (shadcn migration, lucide icons, next/image)
- **WS-20+21+22** Supabase schema, security hardening, next.config.ts

### Batch 6 — Ship
- Build, lint, visual QA, `/code-review`, deploy to Vercel
