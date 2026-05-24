# Repository Hygiene

> Last Updated: 2026-05-24

## Root Directory Rule

Keep only durable project entrypoints and configuration at the repository root. Put old audits, one-off reports, exports, and investigation artifacts under `docs/archive/` or keep them untracked locally.

## Required Local Checks

Run the repo's quick checks before opening or merging a PR. If this repo has a hygiene script, run it before the normal test commands.

## GitHub Settings

- Automatically delete merged branches.
- Allow update branch on stale PRs.
- Prefer squash merge for normal PRs.
- Keep Wiki disabled unless it is intentionally used.
- Keep Projects enabled only when GitHub Projects is the active task source.

## Manual Review Items

Do not automate these without explicit approval:

- deleting local stashes
- deleting GitHub environments
- changing secrets
- enabling paid security features
- changing production branch protection
