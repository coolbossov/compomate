# Backlog

> **Last Updated:** 2026-04-24

## High Priority

## Normal
- [ ] **AI Platform Evaluation** — Evaluate before building AI compositing/background/portrait features. Background removal: Photoroom API ($0.02/call) vs @imgly/background-removal (free WASM) vs remove.bg. Background gen: Replicate bria/generate-background, Flux 2 Pro ($0.033/image). AI portrait upsell: Astria.ai, Fal.ai, Aragon.ai. Institutional/safe: Adobe Firefly API. Horizon: post-hub launch (2027+).
- [ ] **Monthly compomate_* table size check** — query table sizes on `qnfafwqjjbgiaygrdcoc` (shared with Portal + HELM). If `compomate_*` total > 100MB OR project-wide total > 300MB, trigger extraction plan to a separate free-tier Supabase project. Query via Supabase Management API:
  ```bash
  curl -sf -X POST "https://api.supabase.com/v1/projects/qnfafwqjjbgiaygrdcoc/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN_PERSONAL}" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT tablename, pg_size_pretty(pg_total_relation_size('\''public.'\''||tablename)) AS size FROM pg_tables WHERE schemaname='\''public'\'' AND tablename LIKE '\''compomate_%'\'' ORDER BY pg_total_relation_size('\''public.'\''||tablename) DESC;"}'
  ```
  **Baseline 2026-04-24:** total ~248 KB across 7 tables. Largest: `compomate_r2_objects` 80 KB, `compomate_projects` 32 KB, `compomate_sessions` 32 KB, `compomate_usage_logs` 32 KB, `compomate_batch_jobs` 24 KB, `compomate_backdrops` 24 KB, `compomate_templates` 24 KB.

## Low / Nice to Have
