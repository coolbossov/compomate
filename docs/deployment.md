# Deployment

> Last Updated: 2026-05-24

This is the short release checklist. Keep repo-specific branch policy and production rules in the infrastructure policy as the source of truth.

## Normal Release Path

1. Work from a focused branch unless the repo policy explicitly allows another path.
2. Run `npm run verify`.
3. Open the normal review path for this repo.
4. Confirm preview or staging is ready when the repo has previews or staging.
5. Use the risk-based testing guidance in `docs/testing.md`.
6. Deploy production only through the repo-specific policy.

## Pre-Release Checklist

- The repo readiness command passes or the change is docs-only.
- The PR or commit explains what changed and how it was checked.
- Docs are updated if the change affects testing, deployment, environment variables, integrations, recovery, security, or operations.
- Production-impacting changes include rollback notes.
- High-risk changes have preview, staging, or equivalent verification evidence before production.

## Post-Deploy Smoke Check

After a production deploy, check:

1. Vercel deployment status is ready.
2. The diagnostics endpoint or homepage loads.
3. The route or editor workflow changed by the release works.
4. Sentry has no new release-correlated issue.
5. Supabase, R2, export, AI analysis, or rate-limit flows touched by the release have a targeted smoke check.

## Rollback

Document the fastest safe rollback path for this repo:

- Deployment rollback: use the previous known-good Vercel deployment when rollback is safer than a forward fix.
- Code revert path: revert the merge commit or open a focused fix branch.
- Data restore path: preserve Supabase/R2 data and restore only after confirming ownership and affected sessions.
- Who or what must be notified: notify Alex if uploads, exports, storage ownership, or production image output may be affected.

Do not add heavier release gates unless a repeated failure or real incident proves they are needed.
