# Testing

## Quick checks

Run these before opening or updating a PR:

```bash
npm run lint
npm run test
npm run build
```

`npm run test:smoke` combines the same local gate into one command.

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

## Deploy and post-deploy

- Production deploys are Vercel-driven.
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
