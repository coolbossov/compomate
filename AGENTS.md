# compomate - Agent Instructions

Read this file first. Then read `CLAUDE.md` when it exists for repo-specific operating rules that are not duplicated here.

## Documentation Standard

- `CHANGELOG.md` is required for every shipped or reviewable change
- `docs/decisions.md` is required for durable decisions, tradeoffs, and policy changes
- `docs/testing.md` is the testing contract before shipping
- `docs/lessons-learned.md` and `docs/knowledge-index.md` are conditional files used only in repos that benefit from deeper operational history

## Retrieval Policy

- do not read `docs/decisions.md` or `docs/lessons-learned.md` by default on every task
- read `docs/knowledge-index.md` first when it exists and the task may depend on repo history
- read `docs/decisions.md` when changing architecture, infra, integrations, workflow policy, or other tradeoff-heavy areas
- read `docs/lessons-learned.md` when debugging, deploying, or touching a known fragile subsystem
- use `CHANGELOG.md` for shipped-history lookup, regression tracing, and rollback context

## Git Workflow

- Never commit directly to `main` unless this repo is explicitly direct-to-main
- Update docs in the same change when architecture, integrations, env vars, testing, or recovery behavior changes
- For shared or operational infrastructure changes, review `~/.ai-ops/docs/infrastructure.md`, use `/infra-update` for approval-gated infrastructure doc updates, and treat the infra advisory workflow as a non-blocking reminder
- Update `CHANGELOG.md` in the same change for every shipped or reviewable change
- Include the reason for the change in the changelog entry
- Update `docs/decisions.md` when the change reflects a design choice or tradeoff

## Repo-Specific Context

- Read `CLAUDE.md` for the repository purpose, hard rules, stack, deploy notes, and any constraints that are intentionally repo-specific.
- Do not duplicate long repo background here unless `CLAUDE.md` is absent.
