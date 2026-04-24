# CompoMate — Disaster Recovery

**Last Updated:** 2026-04-24

---

## Platform

**Hosting:** Vercel
**Live URL:** https://app.sapicture.day
**Database:** Supabase project `qnfafwqjjbgiaygrdcoc` (`Portal-Route`, MyStartup.me org, us-east-2, free tier — shared with Portal + HELM). Restore runbook: `~/.claude/infra-details/restore-runbooks/portal-supabase.md` (same DB instance).
**File Storage:** Cloudflare R2 bucket `compomate-uploads` — all user images live here, not in Supabase.
**Repo:** github.com/coolbossov/compomate (private)

---

## Deploy & Rollback

**Deploy trigger:** Push to `main` via CI squash-merge (GitHub Actions: `check` → `e2e` → `auto-merge`).

**Rollback procedure:**
1. Identify last known-good commit SHA via `git log origin/main`
2. Create `fix/rollback-to-<sha>` branch from that SHA, open PR
3. Alternatively: Vercel dashboard → Deployments → select previous deployment → Promote to Production (instant, no CI)

**Vercel dashboard:** https://vercel.com

---

## Database Backup

**Supabase tables at risk:** `compomate_sessions`, `compomate_templates`, `compomate_backdrops`, `compomate_usage_logs`, `compomate_projects`, `compomate_r2_objects`, `compomate_batch_jobs`.

**Note:** In Phase 1 with anonymous sessions disabled, there is minimal user data at risk in the DB. The critical data is in R2 (uploaded files).

**Automated backup:** CompoMate tables are captured by the shared `Portal-Route` daily backup to R2 — see `~/.claude/infra-details/restore-runbooks/portal-supabase.md` (backup path `r2:sapd-portfolio/portal-backups/daily/YYYY-MM-DD/`). Filter for `compomate_*.json` files for selective restore.

**Manual backup:**
```bash
supabase db dump --linked --data-only --schema=public \
  --table='compomate_*' > compomate_$(date +%Y%m%d).sql
```

---

## R2 File Recovery

**Critical:** R2 contains all uploaded subject PNGs, backdrops, and export results. These cannot be re-created without user re-upload.

**Cloudflare R2 does not have automatic versioning by default.** <!-- TODO: verify if versioning is enabled on compomate-uploads bucket -->

**If files are accidentally deleted:**
1. Check Cloudflare R2 dashboard for any soft-delete/versioning features enabled
2. If no versioning: files are unrecoverable — inform affected users
3. Consider enabling R2 versioning for the `compomate-uploads` bucket going forward

**R2 object lifecycle:** `compomate_r2_objects` table tracks objects with optional `expires_at` (migration `20260322_add_expires_at_to_r2_objects.sql`). Expired objects can be cleaned up via a maintenance job.

---

## Monitoring

<!-- TODO: verify if Uptime Kuma monitor exists for app.sapicture.day -->
- Sentry captures export pipeline errors in production
- Vercel provides deployment status and function logs
- PostHog session recording can help diagnose UX-level issues
- Cloudflare R2 dashboard shows storage usage and request metrics

---

## Incident Response

**Scenario: Export fails for all users**
1. Check Vercel function logs for `/api/export` errors
2. Most common causes: R2 access key expired, Sharp memory limit hit, Supabase unavailable (if persistence enabled)
3. Verify R2 credentials: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` in Vercel env vars
4. Check Cloudflare R2 status: https://www.cloudflarestatus.com

**Scenario: AI generation failing**
1. Check fal.ai status: https://status.fal.ai
2. Verify `FAL_KEY` is set and valid in Vercel env vars
3. AI generation failure is non-critical — users can still upload backdrops manually

**Scenario: Rate limiting too aggressive**
1. Check Upstash Redis if configured — may have stale counters
2. Flush Redis keys or temporarily disable by removing Upstash env vars
3. In-process fallback activates automatically when Upstash vars are absent

**Scenario: Sharp memory pressure on Vercel**
1. Vercel functions have 1GB memory limit by default
2. Large batch exports (100+ subjects at 8x10) may approach this limit
3. Increase function memory in `vercel.json` if needed: `{ "functions": { "api/export/route.ts": { "memory": 3008 } } }` <!-- TODO: verify current memory config -->
