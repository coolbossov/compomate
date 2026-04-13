# CompoMate — Database

**Last Updated:** 2026-04-13

**Supabase Project:** <!-- TODO: verify CompoMate Supabase project ref -->

RLS is enabled on all tables. All tables allow full access via service role key only. Phase 1 design: `user_id` nullable everywhere (anonymous sessions). Auth planned for Phase 3.

Migration approach: SQL files in `supabase/migrations/`, applied via Supabase CLI. Two migrations pending manual application as of 2026-03-22: `20260322_create_batch_jobs.sql` and `20260322_add_expires_at_to_r2_objects.sql`.

---

## Key Tables

### `compomate_sessions`
Saved composition states. Identified by `session_token` (browser-side identifier).

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Internal ID |
| `session_token` | text UNIQUE | Browser session identifier |
| `job_name` | text | User-given name for this composition job |
| `composition` | jsonb | Full composition state (positions, shadow, reflection, fog, etc.) |
| `export_profile_id` | text | Active export profile (8x10, 5x7, 4x5, 1x1, original) |
| `name_style_id` | text | Active name overlay style |
| `font_pair_id` | text | Active font pair |
| `lock_settings` | boolean | Whether composition settings are locked for batch |
| `user_id` | uuid NULLABLE FK → auth.users | NULL in Phase 1; populated in Phase 3 |

**RLS:** Service role all access; no public read.

---

### `compomate_templates`
Named composition templates that can be reused across jobs.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | — |
| `session_id` | text | Session token of the session that created this template |
| `name` | text | Template name |
| `composition` | jsonb | Composition settings snapshot |
| `export_profile_id` / `name_style_id` / `font_pair_id` | text | Export settings |
| `user_id` | uuid NULLABLE | Phase 3: user ownership |

**RLS:** Service role all access.

---

### `compomate_backdrops`
Metadata for backdrop images stored in R2. One row per uploaded/generated backdrop.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | — |
| `session_token` | text | Associated session |
| `name` | text | Display name |
| `r2_key` | text | R2 object key for fetching the file |
| `width` / `height` | integer | Image dimensions in pixels |
| `source` | text | `upload` / `ai-flux` / `ai-ideogram` / `reference` |
| `prompt` | text NULLABLE | AI prompt used to generate (if applicable) |
| `user_id` | uuid NULLABLE | Phase 3: user ownership |

**RLS:** Service role all access.

---

### `compomate_usage_logs`
Event log for exports, AI generations, and reference analyses. Used for future metering and SaaS billing.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | — |
| `session_token` | text | Session that triggered the event |
| `event_type` | text | `export` / `generate-backdrop` / `analyze-reference` |
| `model` | text | `flux` / `ideogram` / `gemini-flash` / `sharp` |
| `duration_ms` | integer | Processing time |
| `output_width` / `output_height` | integer | Output dimensions |
| `user_id` | uuid NULLABLE | Phase 3: user ownership |

**RLS:** Service role all access.

---

### `compomate_r2_objects`
Tracks R2 objects for lifecycle management and expiry cleanup.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | — |
| `object_key` | text | R2 object key |
| `session_token` | text | Owning session |
| `expires_at` | timestamptz NULLABLE | Added migration 20260322; used for cleanup jobs |

---

### `batch_jobs` (migration pending)
Async batch export jobs for large volume runs.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | — |
| `session_token` | text | Owning session |
| `status` | text | `queued` / `processing` / `complete` / `failed` |
| `total` / `completed` | integer | Progress counters |
| `result_r2_key` | text | R2 key for the output ZIP when complete |

**Note:** Migration `20260322001_create_batch_jobs.sql` must be applied to Supabase production manually.

---

## Migration History

| File | Date | Purpose |
|------|------|---------|
| `20260306_create_compomate_projects.sql` | 2026-03-06 | Initial projects table (legacy, replaced) |
| `20260307_compomate_full_schema.sql` | 2026-03-07 | Full schema: sessions, templates, backdrops, usage_logs |
| `20260308_add_session_id_to_projects.sql` | 2026-03-08 | Add `session_id` to templates |
| `20260309_create_compomate_r2_objects.sql` | 2026-03-09 | R2 object tracking table |
| `20260322001_create_batch_jobs.sql` | 2026-03-22 | Async batch jobs table — **pending manual apply** |
| `20260322_add_expires_at_to_r2_objects.sql` | 2026-03-22 | Add `expires_at` to R2 objects — **pending manual apply** |
