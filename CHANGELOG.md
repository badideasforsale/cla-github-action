# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

This section tracks work toward v3.0.0.

### Repo

- Renamed default branch `master` → `main`.
- README banner updated: this repository is now a maintained fork of [contributor-assistant/github-action](https://github.com/contributor-assistant/github-action) (archived 2026).
- Added `.github/dependabot.yml` to keep npm + actions dependencies tracked.
- Added [`CLAUDE.md`](./CLAUDE.md) at the repo root to document architecture for future contributors and AI tooling.

### Changed

- **Action runtime:** `node20` → `node24` (matches `actions/checkout@v6`, `actions/setup-node@v6`).
- **Dependencies:** `@actions/core` ^1.10 → ^2.0; `@actions/github` ^4.0 → ^8.0 (the last CJS-compatible majors; v3/v9 are ESM-only and require a separate migration).
- **Toolchain:** TypeScript ^4.9 → ^5.9; `@vercel/ncc` ^0.38 → ^0.44; `ts-jest` ^29.0 → ^29.4; `@types/node` ^18 → ^22; explicit `jest` ^29.7 + `@types/jest`.
- **CI workflows:** rewritten. Single Node 24.x build matrix. All third-party actions SHA-pinned with version-tag comments. Least-privilege `permissions:` blocks on every job. `pull_request_target` and overbroad `branches: '*'` triggers removed.
- **CodeQL:** language switched to `javascript-typescript`; explicit `security-events: write` permission; autobuild step dropped (unnecessary for JS/TS).
- Build script: `ncc build` now takes an explicit entry path instead of relying on a misleading `main` field.

### Added

- `verify-dist` CI job that rebuilds and fails the PR if `dist/` is stale (replaces the husky pre-commit hook).
- `dependency-review` CI job on PRs (`actions/dependency-review-action@v5`).
- `npm run validate-actions` and a CI step using `mpalmer/action-validator@v0.9.0` — validates `action.yml` and workflow YAML against the schemas GitHub Actions actually accepts. Requires `action-validator` v0.9.0 locally (earlier versions reject `node24`).
- New `SECURITY.md` documenting GitHub private vulnerability reporting, scope, and supply-chain hygiene.
- `engines.node: ">=24"` and explicit `repository.url` in `package.json`.

### Operational

- **Workflows are temporarily disabled** (`gh workflow disable`) to suppress noisy failed-build notifications during the v3 WIP. They will be re-enabled before v3 ships (see plan M7.8).

### Removed

- `@octokit/rest`, `@octokit/types`, `actions-toolkit`, `node-fetch`, `lodash` — all had zero imports; `lodash.escapeRegExp` replaced with a one-line inline.
- `husky` v4 — the v4 config style is dead on modern installs anyway; replaced by `verify-dist`.
- `src/addEmptyCommit.ts` — exported but never imported (dead code).
- `.github/workflows/assign-to-project.yaml` — pointed at a project URL in the original `cla-assistant` org (different repo); dead in the fork from day one.

### Fixed

- Two latent null-safety bugs surfaced by stricter octokit v8 types:
  - `pullRequestComment.ts:65,67` — `comment.body.match()` would throw when the comment had no body (rare but real).
  - `signatureComment.ts:21-24` — accessing `prComment.user.login` would throw when the comment author had been deleted; `body.trim()` likewise.

## [2.6.1] and earlier

See the upstream history at [contributor-assistant/github-action](https://github.com/contributor-assistant/github-action/releases) for releases before this fork picked up maintenance.
