# CompoMate — AI Agent Changelog

> This file is maintained by AI agents (Claude, Codex, etc.) to track all changes made to the codebase.
> Every agent that modifies the repo must update this file before committing.
> Format: newest entries at the top.

---

## [Unreleased] — Branch: `feature/compomate-full-implementation`

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
