# Observability

> Last Updated: 2026-05-24

This is the first place to look when the repo may be broken.

## Primary Signals

| Signal | Where | Use |
|-|-|-|
| Diagnostics | `npm run test:diag` / diagnostics endpoint | Fast app readiness check |
| Deployment platform | Vercel | Deployment status and runtime logs |
| Error monitoring | Sentry | Server/client errors and release-correlated failures |
| Product analytics | PostHog, Vercel Analytics, Speed Insights | Usage and performance behavior when applicable |
| Storage and data | Supabase, Cloudflare R2 | Auth, persistence, uploads, exports, and ownership diagnostics |
| External AI | fal.ai, Gemini | AI generation and analysis failures |

## After Deploy

Use this quick check after production changes:

1. Confirm deployment status is ready.
2. Open the health endpoint or main route.
3. Check error monitoring for new issues since deploy time.
4. Check the route or workflow changed by the release.
5. For payment, email, auth, or data changes, verify the external system and internal state agree.

## Error Handling Expectations

- Do not log raw secrets, tokens, customer contact data, payment metadata, or bearer links.
- Prefer structured logs with request id, phase, and sanitized external ids.
- Use error monitoring for exceptions that need follow-up, with sensitive context stripped.
- Use alerts only for operational action, not routine debug output.

## Common Checks

- Broken app shell or editor: check Vercel logs, browser console, and Sentry.
- Broken upload/export: check R2 env, object ownership, presigned URL responses, and Sharp/export logs.
- Broken AI feature: check provider key, provider status, and route-level error mapping.
- Broken analytics or monitoring: check PostHog/Sentry/Vercel env and release timing.
- Backup or restore concern: preserve Supabase/R2 state before deleting or rewriting production data.
