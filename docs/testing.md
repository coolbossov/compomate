# Testing

## Email Testing Safety

If this repo sends email in tests, local development, staging, or automation, never send to fake, random, or nonexistent recipients unless those exact addresses are already suppressed or otherwise blocked from delivery. Use real controlled test inboxes when delivery must be verified. If synthetic recipients are needed, suppress the generated addresses before repeated sends and check provider bounces before retrying.

## Quick checks

Run these before opening or updating a PR:

```bash
npm run verify
```

`npm run verify` is the default readiness command. It currently delegates to `npm run test:smoke`, which runs lint, Vitest, and build.

## Risk-Based Test Tiers

Use the lightest tier that matches the change:

| Tier | When to use | Verification |
|-|-|-|
| Docs-only | Documentation, checklists, or process-only changes | Review diff and run `git diff --check` |
| Low | Copy, styling, or isolated UI/config changes | `npm run verify` |
| Medium | Editor shell, uploads, Supabase, R2, analytics, or shared components | `npm run verify` plus targeted manual smoke or E2E |
| High | Export/compositing, storage ownership, auth, production data, rate limiting, or payments if added later | `npm run verify`, targeted E2E/manual live smoke, rollback notes, and observability check |

## CI behavior

- `check` runs on push and pull request.
- `check` covers lint, TypeScript, build, and Vitest.
- `e2e` runs on pull requests only and uses Playwright against a production build.
- `auto-merge` is allowed only after the required jobs succeed.

## E2E

Run the browser suite locally when the change affects the editor shell, export pipeline, uploads, or any public page:

```bash
npm run test:e2e
```

Useful variants:

```bash
npm run test:e2e:ui
npm run test:e2e:debug
```

The editor-shell smoke suite also verifies the Minimal Canvas shell and official pink active state, the top-level `Composite` / `Background Studio` workspace switch, collapsed Background Studio inspector defaults, library-rail collapse behavior, and the 1-versus-3 subject-guide change. It intentionally does not submit paid backdrop-generation requests.

## Deploy and post-deploy

- Production deploys are Vercel-driven.
- Vercel Git deployments are production-only: `main` is enabled and all non-main branches, including slash-containing branches, are disabled by the `**` rule in `vercel.json`. Pull-request checks run in GitHub Actions without a Vercel preview/staging deployment.
- After a production deploy, confirm the diagnostics endpoint responds:

```bash
npm run test:diag
```

- If the change affects compositing, export, or storage behavior, also perform a manual smoke check in the live app:
  - load the app shell
  - upload a representative subject image
  - export at least one composite successfully

## Known gaps

- Canvas-heavy behavior is only lightly automated.
- E2E coverage is smoke-oriented and does not prove every compositor path.
- Changes to Sharp export logic or asset rendering still require manual verification.
