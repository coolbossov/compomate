# CompoMate — Architecture Decision Records

**Last Updated:** 2026-04-13

---

## [2026-03-06] Sharp for Export, react-konva for Preview — Accept Visual Mismatch

**Context:** The app needs both an interactive preview (drag, transform, real-time adjustments) and a print-quality export (300 DPI, ICC sRGB, pixel-perfect compositing).

**Decision:** Use react-konva for the canvas preview and Sharp for server-side export. Accept that minor visual differences exist between the two renderers.

**Why:** Sharp on Node.js can produce 300 DPI ICC-profiled PNG output that browser canvas cannot match. Konva handles interactive transforms (drag, resize, real-time updates) with GPU-accelerated rendering. The two renderers serve different purposes — Konva for UX, Sharp for print output.

**Alternatives considered:**
- Canvas API for both — rejected because browser canvas is 72 DPI, no ICC profile support, and batch rendering of 200+ subjects would freeze the tab
- Serverless canvas (node-canvas) — rejected because Sharp's compositing pipeline is more capable and better maintained for multi-layer operations

---

## [2026-03-06] R2 for File Transport — Bypass Vercel 4.5MB Body Limit

**Context:** Subject PNG cutouts and backdrop images can easily exceed 4.5MB. Vercel serverless functions have a hard 4.5MB request body limit.

**Decision:** All file uploads go direct to Cloudflare R2 via presigned PUT URLs. The export API receives R2 object keys (not file bytes). Server fetches files from R2, runs Sharp, and stores result back in R2. Client downloads via presigned GET URL.

**Why:** Presigned URLs eliminate the Vercel body limit entirely. Full-resolution images (20+ MB) work transparently. R2 also serves as durable storage for session persistence and batch export intermediates.

**Alternatives considered:**
- FormData upload with client-side iterative quality reduction — was the original approach, caused quality loss and complex client logic; replaced by R2 approach
- Vercel Blob — not available at project start; R2 was already in use for SAIL

---

## [2026-03-06] Single Zustand Store, zundo on Composition Slice Only

**Context:** The app has multiple categories of state: files, composition settings, names, export queue, UI. Undo/redo is needed for composition adjustments but not for file lists or batch queue state.

**Decision:** Single Zustand store with named slices. zundo middleware wraps only the `composition` slice. undo/redo does not affect file uploads, name entry, or export queue.

**Why:** A single store is easier to serialize for session persistence and provides a single subscription model for components. Applying zundo to the full store would make undo unexpectedly revert file list changes, which is confusing UX.

**Alternatives considered:**
- Multiple separate Zustand stores — rejected because cross-store interactions (e.g., composition referencing active file IDs) require manual synchronization
- Redux — rejected as overkill; Zustand slices achieve the same organization with less boilerplate

---

## [2026-03-06] TTF Fonts Embedded in Repo — Not CDN

**Context:** The name overlay pipeline (Sharp SVG renderer) requires fonts at server-side render time. CDN fonts add latency and external dependency.

**Decision:** TTF font files stored in `public/fonts/` and treated as build-time assets. The Sharp text pipeline loads fonts from the filesystem path.

**Why:** Zero latency, no CDN dependency, deterministic rendering across deployments. Font files are small (<5 MB total) and rarely change.

**Alternatives considered:**
- Google Fonts CDN at export time — rejected because network call adds 100-300ms per export and introduces failure mode
- System fonts — rejected because font availability varies by OS and Vercel's runtime doesn't guarantee specific fonts

---

## [2026-03-22] No Auth in Phase 1 — Anonymous Sessions via Cookie

**Context:** CompoMate needs to be usable immediately without account creation. Auth adds friction for first-time users.

**Decision:** All `user_id` columns are nullable. Session persistence is opt-in, gated behind `COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=true`. Session token is stored in the browser (cookie/localStorage). Auth planned for Phase 3.

**Why:** Volume photography studios may want to try the tool before committing to an account. Anonymous sessions reduce friction. Opt-in persistence env var prevents accidental data accumulation in production before a proper access model is designed.

**Alternatives considered:**
- Required login — rejected for Phase 1 as it blocks trial usage; deferred to Phase 3
- Always-on persistence — rejected because anonymous sessions have no ownership model; storage would grow unbounded

---

## [2026-03-22] Rate Limiting: In-Process Fallback, Upstash Redis Optional

**Context:** The export and generate-backdrop endpoints are expensive (Sharp CPU, fal.ai API cost). Rate limiting is needed, but Upstash adds cost and complexity.

**Decision:** `src/lib/server/rate-limit.ts` uses in-process counters by default. If `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, it switches to distributed Upstash Redis rate limiting across Vercel instances.

**Why:** In-process limiting works for single-instance or low-traffic scenarios with zero cost. Redis is needed for multi-instance Vercel deployments where per-instance counters allow 2x-Nx the intended rate. The env var gate makes production hardening opt-in without blocking development.

**Alternatives considered:**
- Always-Redis — rejected as adds cost and a required service dependency
- Vercel Edge middleware rate limiting — rejected because it doesn't have access to the same Redis store and adds cold start latency

---

## [2026-03-06] 5-Layer Progressive Blur Reflection

**Context:** Subject reflections on studio backdrops need to look realistic — sharp at the feet, progressively blurring toward the bottom of the reflection.

**Decision:** Reflection is implemented as 5 composite layers, each with increasing Gaussian blur applied to the flipped subject. Layers are composited with decreasing opacity.

**Why:** A single blurred reflection looks artificial. Progressive blur matches how reflections appear on polished surfaces (sharp near the object, diffuse further away). 5 layers is a balance between realism and Sharp compositing performance.

**Alternatives considered:**
- Linear blur gradient mask — requires pixel-level mask operations that Sharp doesn't natively support without complex workarounds
- Single blurred layer — too artificial; rejected after visual testing
