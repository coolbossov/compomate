# CompoMate — Architecture

**Last Updated:** 2026-09-01

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | ^16.2.0 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS v4 + shadcn/ui | ^4 |
| Canvas Rendering | react-konva + Konva | ^19.2.3 / ^10.2.0 |
| Server Compositing | Sharp | ^0.34.5 |
| State Management | Zustand + zundo (undo/redo) | ^5.0.11 / ^2.3.0 |
| File Storage | Cloudflare R2 (S3-compatible) | @aws-sdk/client-s3 ^3 |
| Database | Supabase (PostgreSQL) | @supabase/supabase-js ^2.49.8 |
| AI Backdrop Gen | fal.ai (Flux Schnell) | FAL_KEY |
| AI Reference Photo | Google Gemini | GEMINI_API_KEY |
| Rate Limiting | Upstash Redis (optional) | @upstash/ratelimit + @upstash/redis |
| Error Tracking | Sentry | @sentry/nextjs ^10.42.0 |
| Analytics | PostHog (project 312619, SAIL) | posthog-js ^1.359.1 |
| Performance | Vercel Analytics + Speed Insights | @vercel/analytics + @vercel/speed-insights |
| Hosting | Vercel | — |
| Live URL | https://app.sapicture.day | — |

## Components

```
Root Layout (src/app/layout.tsx)
  ├── PostHog instrumentation (src/instrumentation-client.ts)
  └── Home — Composition Root (src/app/page.tsx — being decomposed)
      ├── AppHeader
      │   ├── Job name (editable inline)
      │   ├── Version badge
      │   └── Shortcut help (?)
      ├── FilePanel (left sidebar)
      │   ├── BackdropSection — upload + thumbnail list
      │   ├── SubjectSection — upload + thumbnail list
      │   ├── BackdropPanel (tabbed)
      │   │   ├── Tab: Upload
      │   │   ├── Tab: AI Generate (fal.ai Flux Schnell)
      │   │   └── Tab: Reference Photo (Gemini)
      │   └── ProjectSection — Save/Load sessions (Supabase)
      ├── Canvas (center — react-konva Stage)
      │   ├── Backdrop Layer (Konva.Image)
      │   ├── Shadow Layer (Konva.Ellipse)
      │   ├── Reflection Preview (Konva.Image, flipped)
      │   ├── Subject Layer (Konva.Image + Transformer)
      │   ├── Fog Layer (Konva.Rect + gradient)
      │   ├── Name Overlay (Konva.Image from SVG)
      │   ├── DangerZoneOverlay (Konva.Rect with pattern)
      │   └── Status bar
      └── Right Sidebar
          ├── ControlPanel
          │   ├── Auto Assist presets
          │   ├── Placement sliders (x, y, height)
          │   ├── Shadow controls (toggle + 5 sliders)
          │   ├── Reflection controls (toggle + 4 sliders)
          │   └── Blend Helpers (fog, leg fade, lightwrap)
          └── ExportPanel
              ├── Name entry (first + last, sticky last name)
              ├── Name style selector
              ├── Export profile (8x10, 5x7, 4x5, 1x1, original)
              ├── Safe area toggle
              ├── Export single button
              └── Batch queue (CSV-driven, ZIP download)
```

## Data Flows

### Single Export Flow
```
User sets backdrop + subject + composition settings
  → click Export
  → POST /api/upload { filename, contentType }
    → server generates presigned PUT URL (R2, 5 min)
  → client PUT direct to R2 (bypasses Vercel 4.5MB body limit)
  → POST /api/export { backdropKey, subjectKey, composition, names, profile }
    → server fetches both files from R2
    → Sharp pipeline (11 stages: normalize → placement → backdrop → defringe
                      → shadow → reflect → lightwrap → fog → text → safety → export)
    → result PUT to R2
    → returns presigned GET URL (download)
  → client GET download URL → PNG saved
```

### Batch Export Flow
```
User loads CSV (first name, last name per row)
  → batch queue populated from Zustand batch[] slice
  → for each entry: POST /api/export with name overrides
  → results collected → JSZip → ZIP download
```

### AI Backdrop Generation
```
Operator sets direction, activity/environment, style, composition, and optional custom guidance
  → POST /api/generate-backdrop { mode: directions, count: 3 }
    → fal.ai Flux Schnell returns three 1024×1280 source URLs + dimensions
  → browser GET /api/generate-backdrop/image?url=<allowlisted fal.media URL>
    → response body is streamed, not embedded as base64 JSON
  → browser PUT direct to R2
  → three durable direction assets appear in the shared library
  → operator selects one direction
  → POST /api/generate-backdrop { mode: master, sourceImageUrl }
    → Topaz Precision returns one 4× source URL
  → same streaming + direct-to-R2 path stores the 4096×5120 production master
```

The provider-response API deliberately carries references rather than image bytes. Full-resolution results can exceed Vercel's 4.5MB function payload ceiling, so the image route validates `fal.media`, streams the upstream body without buffering it into JSON, and returns only an image content type with no-store/nosniff headers. The browser owns the subsequent R2 upload and exposes a retry state if durable storage fails.

### Session Persistence (opt-in)
```
COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE=true
  → save: POST /api/projects { composition, assets, name }
    → writes to compomate_sessions (Supabase)
  → load: GET /api/projects → lists sessions → load by session_token
```

## State Management (Zustand Slices)

| Slice | Contents | Undo/Redo |
|-------|----------|-----------|
| `files` | backdrops[], subjects[], activeBackdropId, activeSubjectId | No |
| `composition` | xPct, yPct, subjectHeight, shadow, reflection, fog, legFade, lightwrap | Yes (zundo) |
| `names` | firstName, lastName, nameStyle, stickyLastName | No |
| `export` | profile, loading, batch[], batchRunning, exportLocked | No |
| `backdrop` | prompt, style, aspectRatio, generationLoading | No |
| `backgroundStudio` | organization, colors, activity/environment, style, pose guides, editable team overlays, custom direction, refinement | No |
| `ui` | status, canvasSize, showSafeArea, showDangerZone, projectName | No |

zundo middleware wraps only the `composition` slice — undo/redo applies to visual adjustments only, not file uploads or UI state.

## Sharp Pipeline (11 Stages)

`src/app/api/export/route.ts`

1. **normalize** — decode, ICC→sRGB, strip EXIF, enforce size limits
2. **placement** — calculate pixel coordinates from percentage values
3. **backdrop** — resize to 4000×5000 (withoutEnlargement), or native dimensions
4. **defringe** — remove green/blue color spill on subject edges
5. **shadow** — directional shadow from light angle + elevation
6. **reflect** — 5-layer progressive blur reflection; zero-below-feet cleanup before flip
7. **lightwrap** — edge blending: sample backdrop colors at subject boundary
8. **fog** — floor fog gradient overlay
9. **text** — name overlay via TTF font + SVG pipeline
10. **safety** — check danger zones, return warnings (non-blocking)
11. **export** — profile crop, resize, DPI=300, ICC sRGB tag

## File Structure

```
src/
  app/
    page.tsx                          # Composition root (being decomposed)
    globals.css                       # Custom CSS classes (.panel, .btn-primary, .input)
    layout.tsx                        # Root layout + PostHog preconnect
    instrumentation-client.ts         # PostHog init (defaults: '2026-01-30')
    api/
      export/route.ts                 # Sharp compositing pipeline (731 lines)
      upload/route.ts                 # Presigned PUT URL generator
      generate-backdrop/route.ts      # fal.ai direction/master orchestration
      generate-backdrop/image/route.ts # allowlisted streaming image transport
      projects/route.ts               # Session persistence (opt-in)
      diagnostics/route.ts            # Health check endpoint
  lib/
    shared/
      composition.ts                  # CompositionState type, export profiles, shadow math
      name-overlay.ts                 # SVG name overlay generator (shared client/server)
      project-snapshot.ts             # Snapshot serialization types
    server/
      rate-limit.ts                   # In-memory + Upstash Redis rate limiter
      supabase-admin.ts               # Supabase service-role client
      project-persistence.ts          # Feature gate (COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE)
supabase/
  migrations/
    20260307_compomate_full_schema.sql
    20260308_add_session_id_to_projects.sql
    20260309_create_compomate_r2_objects.sql
    20260322001_create_batch_jobs.sql
    20260322_add_expires_at_to_r2_objects.sql
public/
  fonts/                              # TTF fonts embedded at build time (not CDN)
```
## Editor Workspaces

The root editor shell has two top-level workspaces that share one Zustand asset state:

- **Composite** is the production compositor for subjects, active backdrops, effects, names, and export.
- **Background Studio** is a direction-setting workspace for choosing a team/activity, visual style, planned subject count, and team-level overlays before selecting or generating a backdrop.

Background Studio embeds the existing `BackdropPanel` rather than creating a second generation or storage path. Uploads, the in-session library, fal.ai generation, R2 ownership, and Supabase project snapshots therefore continue to use the existing implementation. Snapshot version 3 restores every direction/master and the Background Studio state while retaining legacy v1/v2 reads. The first production workflow keeps organization profiles as explicitly labeled starter/local-session data. Database-backed organization records, reuse-history enforcement, DAM publishing, and Google Drive publishing require separate integration contracts.
