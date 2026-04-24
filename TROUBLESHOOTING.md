# CompoMate Troubleshooting

## Quick Checks

### Run diagnostics

```bash
npm run test:diag
```

or:

```bash
curl -sf https://composite.sapicture.day/api/diagnostics | jq .
```

Expected healthy shape:

```json
{
  "status": "ok",
  "checks": {
    "env": { "ok": true, "duration_ms": 0 },
    "supabase": { "ok": true, "duration_ms": 45 },
    "r2": { "ok": true, "duration_ms": 120 }
  },
  "duration_ms": 130,
  "request_id": "abc123def456gh78"
}
```

### Capture request ID from a failing call

```bash
curl -I https://composite.sapicture.day/api/r2/presign/... 
```

Look for `x-request-id` in response headers and use it in logs and Sentry.

## Triage Order

1. Vercel function logs (filter by `request_id`)
2. Sentry issues (`sail-cq.sentry.io`)
3. Supabase logs (`qnfafwqjjbgiaygrdcoc.supabase.co`)
4. Cloudflare R2 bucket (`compomate-uploads`)

## Error Codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `R2_NOT_CONFIGURED` | 503 | Missing R2 env vars |
| `R2_RATE_LIMITED` | 429 | Too many requests |
| `R2_INVALID_KEY` | 400 | Invalid key/inputs |
| `R2_WRONG_PREFIX` | 403 | Key outside managed prefixes |
| `R2_OWNERSHIP_MISS` | 403 | Session does not own object |
| `R2_OWNERSHIP_TIMEOUT` | 503 | Ownership check timed out |
| `R2_UPLOAD_FAILED` | 502 | Upload to storage failed |
| `R2_DOWNLOAD_FAILED` | 502 | Download URL generation failed |
| `R2_DELETE_FAILED` | 500 | Deletion failed |
| `EXPORT_TIMEOUT` | 504 | Export exceeded function time budget |
| `EXPORT_TOO_LARGE` | 413 | Export payload too large |
| `EXPORT_INVALID_INPUT` | 400 | Invalid export request |
| `SUPABASE_WRITE_FAILED` | 500 | Supabase write failure |
| `SESSION_MISSING` | 401 | Session cookie missing |
| `ENV_MISSING` | 503 | Required environment missing |

## Log Level Escalation

Set `COMPOMATE_LOG_LEVEL` in Vercel environment variables:

- `info` for verbose logs
- `warn` (default in production)
- `error` for only failures

No code changes are required after setting this variable.

## Common Issues

- Save Project button disabled:
  - Refresh the Projects panel to re-check persistence.
  - Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Export errors:
  - Check `/api/export` logs for `EXPORT_INVALID_INPUT`.
  - Confirm subject/backdrop keys still exist in R2.
- Cross-session project visibility:
  - Clear browser cookies and reload; verify session-scoped project APIs are deployed.
