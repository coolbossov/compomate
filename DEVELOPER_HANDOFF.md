# CompoMate Developer Handoff

This document is a continuation handoff for another developer or AI coding agent.
It explains what was changed in this pass, why those changes were made, how the current logic works, how to test it, and what remains open.

## Goal Of This Pass

The main objective was to fix the highest-impact issues from a review of the current app:

1. Remote project persistence was unsafe by default.
2. The editor preview and exported image could disagree because they were not using the same spatial assumptions.
3. The name overlay existed only in the export path, not in the live editor preview.
4. Import/export behavior was more memory-heavy and cancellation behavior was weaker than necessary.
5. The export API had byte-size limits, but not decoded image-dimension guardrails.

The work in this pass addressed those items directly without introducing a larger auth/storage rewrite.

## Summary Of What Was Implemented

### 1. Persistence Is Disabled By Default Unless Explicitly Enabled

Problem:

- The app had save/load routes backed by a Supabase service-role client.
- Those routes were reachable without user authentication.
- Snapshots included full inline image data URLs.
- That meant enabling Supabase effectively exposed project content to anyone who could reach the routes.

What changed:

- Added a server-side gate in `src/lib/server/project-persistence.ts`.
- Save/load routes now check that gate before returning any project data or accepting writes.
- The gate requires:
  - Supabase to be configured
  - `COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=true`

Files:

- `src/lib/server/project-persistence.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[projectId]/route.ts`
- `README.md`

Why this approach:

- This is the smallest safe default.
- It avoids pretending authentication exists when it does not.
- It keeps the feature usable for trusted internal testing if someone explicitly opts in.

Important note for the next developer:

- This is a temporary safety gate, not a real long-term security model.
- A proper follow-up should add authentication and project ownership checks.
- Ideally, stored projects should stop embedding image binaries in JSON and instead store references to objects in Supabase Storage or another asset store.

### 2. Preview Geometry Was Reworked To Match The Displayed Backdrop

Problem:

- The backdrop preview used `object-contain` inside the canvas area.
- Subject drag math was based on the full canvas box, not the actual visible backdrop rectangle.
- The export path composes against raw backdrop pixels.
- That created mismatch risk when the backdrop was letterboxed or when the export profile introduced a crop.

What changed:

- Added a computed `backdropBox` in the client.
- `backdropBox` describes the actual rendered rectangle of the backdrop inside the canvas.
- Dragging now converts pointer coordinates into percentages relative to `backdropBox`, not the outer canvas.
- The safe-area overlay is also drawn relative to this same image-space rectangle.
- The subject, shadow, reflection, fog, and overlay preview are now rendered inside the backdrop-aligned container.

Files:

- `src/app/page.tsx`

Why this approach:

- It does not fully simulate the final export crop pipeline, but it removes the biggest preview/export disagreement.
- It also keeps the UI structure mostly intact instead of requiring a separate rendering engine.

What still does not exist:

- There is still no exact final-crop preview for print profiles like `8x10`, `5x7`, etc.
- The current safe-area overlay shows the export crop region inside the backdrop preview, which is a large improvement, but not a full WYSIWYG export simulator.

### 3. Name Overlay Preview Was Added To The Canvas

Problem:

- The server rendered name overlays into exports.
- The editor preview never showed them.
- Users could export a file that looked different from the canvas.

What changed:

- Created a shared helper `src/lib/shared/name-overlay.ts`.
- The server uses it to build the export overlay.
- The client uses the same helper to generate an SVG data URL and render the name overlay over the backdrop preview.

Files:

- `src/lib/shared/name-overlay.ts`
- `src/app/api/export/route.ts`
- `src/app/page.tsx`

Why this approach:

- It eliminates duplicate logic and makes the preview/export text styling consistent.
- It keeps the overlay definition in one place.

### 4. Export API Guardrails Were Strengthened

Problem:

- The export route only enforced upload byte limits.
- A highly compressed file with huge dimensions could still decode into a very expensive image in memory.

What changed:

- Added dimension and total-pixel checks in the export route.
- User images are opened with `sharp(..., { limitInputPixels: ... })`.
- Added hard caps:
  - `MAX_INPUT_PIXELS = 40_000_000`
  - `MAX_INPUT_EDGE_PX = 9_000`

Files:

- `src/app/api/export/route.ts`

Why this approach:

- This is a practical server-side protection against expensive decodes and oversized image operations.
- It is still simple enough to maintain.

Important note:

- These caps are product choices, not mathematical truths.
- If the app later targets larger production assets, adjust them carefully and verify memory/runtime behavior on the deployment platform.

### 5. Client Asset Handling Uses Less Memory During Normal Editing

Problem:

- Each imported asset used to keep both:
  - an object URL for preview
  - a full base64 data URL in memory
- That duplicates image payloads in the browser.
- Bulk import also used `Promise.allSettled`, which could make many conversions run at once.

What changed:

- The `Asset` type now stores the original `File` instead of a cached `dataUrl`.
- Imports are processed sequentially instead of all at once.
- Data URLs are only created at save time when a project snapshot is actually being serialized.

Files:

- `src/app/page.tsx`

Why this approach:

- It is a direct reduction in normal-session browser memory usage.
- It preserves the current save/load snapshot format without needing a schema migration.

Tradeoff:

- Saving a project now does the base64 conversion at save time instead of import time.
- That is the correct tradeoff for current behavior because saving happens far less often than editing/importing.

### 6. Batch Cancel Now Aborts The In-Flight Export Request

Problem:

- Canceling batch export only set a flag for future loop iterations.
- It did not interrupt the currently running `fetch("/api/export")`.

What changed:

- Added `AbortController` handling for the active batch export request.
- The cancel button now aborts the active request as well as setting the loop stop flag.

Files:

- `src/app/page.tsx`

Why this approach:

- It makes cancel behavior materially more truthful from a user perspective.
- It still keeps the batch loop implementation simple.

## Key Files And Their Roles

### `src/app/page.tsx`

This is still the main client UI and remains large. The main changes in this pass are here.

Important areas:

- Asset model:
  - `Asset` now includes `file`
  - no persistent `dataUrl` in normal state
- Preview geometry:
  - `backdropBox`
  - `safeAreaBox`
  - drag math uses backdrop-relative coordinates
- Name overlay preview:
  - `nameOverlayPreviewUrl`
- Snapshot serialization:
  - `buildSnapshot()` is now async and converts `File` to data URL only on save
- Batch export cancellation:
  - `batchRequestAbortRef`

### `src/app/api/export/route.ts`

Server-side image composition route.

Important areas:

- Input size and dimension guardrails
- Shared name overlay generation
- Composition pipeline still uses:
  - backdrop as base
  - shadow
  - reflection
  - subject
  - fog
  - name overlay
  - optional final export profile crop/resize

### `src/lib/shared/name-overlay.ts`

Shared source of truth for name overlay SVG generation.

Both the client preview and server export now depend on this.

### `src/lib/server/project-persistence.ts`

Feature gate for remote project persistence.

This is intentionally explicit and should remain until proper auth is implemented.

## Environment Variables

Current relevant env vars:

```bash
FAL_KEY=
FAL_MODEL=fal-ai/flux/schnell

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=false
```

Important behavior:

- If Supabase vars are missing, save/load is unavailable.
- If Supabase vars exist but `COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE` is not `true`, save/load is still unavailable.
- This is intentional.

## Testing Performed In This Pass

### Static Validation

These commands were run successfully:

```bash
npm run lint
npm run build
npm run audit
```

### Browser Smoke Testing

The app was launched locally and exercised with Playwright CLI.

Smoke checks completed:

1. Loaded the app in a real browser.
2. Confirmed project persistence is disabled in the UI when unavailable.
3. Imported sample backdrop and subject assets.
4. Confirmed the canvas still renders the composition.
5. Confirmed the name overlay preview node exists in the canvas.
6. Exported a PNG successfully end-to-end.

## Current Behavior Decisions

These are intentional product/engineering decisions made in this pass.

### Persistence Safety Takes Priority Over Convenience

The previous behavior made remote persistence too risky for a production-like environment.
The new behavior intentionally forces an explicit opt-in until auth exists.

### Save Format Was Not Migrated

The snapshot format still stores image data URLs.
That was left in place for compatibility and to keep the pass scoped.

Reason:

- Replacing the snapshot format with stored asset references is a larger system change.
- It would require storage handling, lifecycle management, and probably schema updates.

### Preview Is More Accurate, Not Perfectly Identical To Export

The preview now operates relative to the displayed backdrop rectangle, which removes the most visible mismatch.
However, the final export still includes a server-side crop/resize step for non-original profiles.

Reason:

- Full pixel-accurate export simulation in the client would be more complex.
- The current safe-area overlay is a pragmatic midpoint.

## Open Follow-Up Work

These are the most important next steps.

### 1. Add Real Authentication And Project Ownership

Recommended direction:

- Add auth to the app.
- Associate each project with an owner.
- Replace the current service-role-only route pattern with authenticated operations that enforce ownership.
- Once that exists, remove the `COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE` gate.

### 2. Move Project Images Out Of JSON Snapshots

Recommended direction:

- Upload backdrops and subjects to object storage.
- Save asset references in project snapshots instead of embedding large data URLs.
- This will reduce DB payload size and remove the biggest persistence scalability problem.

### 3. Split `page.tsx`

This file is still doing too much.

Recommended extraction targets:

- asset library panel
- canvas preview
- auto-assist controls
- export controls
- project persistence hook
- batch export hook

### 4. Improve Export WYSIWYG Fidelity

Recommended direction:

- Add a visible crop mask or profile frame that more exactly mirrors final export behavior.
- Optionally compute and preview the exact print-profile crop transform in the client.

### 5. Add Real Test Coverage

Current testing is mostly build/lint/smoke level.

Recommended additions:

- unit tests for shared name overlay helper
- unit tests for geometry calculations
- integration tests for `/api/export`
- UI tests for:
  - importing assets
  - drag behavior
  - batch cancel
  - persistence availability states

## Suggested Test Plan For The Next Developer

### Local Manual Test Plan

1. Run:

```bash
npm install
npm run dev
```

2. Verify baseline:

- App loads
- Save is disabled when persistence is unavailable
- Status text starts with the normal canvas instruction

3. Import tests:

- Add one backdrop
- Add one subject
- Drag subject around
- Toggle safe area
- Change export profile
- Enter first and last name
- Confirm overlay appears in preview

4. Export tests:

- Export original profile
- Export `8x10`
- Export `1x1`
- Verify output downloads

5. Batch tests:

- Queue current pair
- Run batch
- Cancel while running
- Confirm queue status changes are sensible

6. Persistence tests:

- Without opt-in env: verify save/load stays disabled
- With Supabase env plus opt-in env: verify save/load route behavior

### API-Focused Test Ideas

- POST `/api/export` with oversized dimensions but small compressed input
- POST `/api/export` with malformed composition JSON
- GET `/api/projects` without opt-in
- POST `/api/projects` without opt-in
- GET `/api/projects/:id` without opt-in

## Risks To Keep In Mind

### 1. Snapshot Saves Still Encode Images In The Browser

This is less memory-heavy than before during editing, but project save still serializes images to base64.
Large assets can still make saves slow or large.

### 2. In-Memory Rate Limiting Is Still Process-Local

The current rate limiter is still an in-memory map.
That means it is not shared across multiple instances.

This was not changed in this pass because it is orthogonal to the main defects fixed here.

### 3. Preview Still Does Not Reproduce Server Rendering Pixel-Perfectly

It is significantly better than before, but it is not a perfect export simulator.

## If Another AI Agent Picks This Up

Suggested starting context:

1. Read:
   - `DEVELOPER_HANDOFF.md`
   - `README.md`
2. Inspect:
   - `src/app/page.tsx`
   - `src/app/api/export/route.ts`
   - `src/lib/shared/name-overlay.ts`
   - `src/lib/server/project-persistence.ts`
3. Run:
   - `npm run lint`
   - `npm run build`
   - `npm run dev`
4. Decide whether the next task is:
   - auth/persistence redesign
   - preview/export fidelity improvements
   - component refactor
   - test coverage

## Files Modified In This Pass

- `README.md`
- `src/app/api/export/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[projectId]/route.ts`
- `src/app/page.tsx`
- `src/lib/server/project-persistence.ts`
- `src/lib/shared/name-overlay.ts`

## Final State Of This Pass

The application is in a safer and more coherent state than before:

- remote persistence is no longer exposed by default
- preview geometry is materially closer to export geometry
- name overlays are visible in-editor
- import behavior uses less steady-state memory
- batch cancel is stronger
- export route has better server-side safety limits

The next meaningful milestone should be either:

1. proper authentication plus real project ownership, or
2. a dedicated preview/export fidelity refactor with test coverage.
