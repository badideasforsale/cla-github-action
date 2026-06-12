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
- **Bundler:** `@vercel/ncc` → `esbuild`. esbuild handles ESM-deps → CJS-bundle interop cleanly, which was the wall we hit pinning to last-CJS majors of `@actions/core` and `@actions/github`. Side benefits: bundle is ~25% smaller (1.27 MB → 982 KB) and the build is ~20× faster (~525 ms → ~25 ms). The TS source stays CJS; only the bundler boundary changed.
- **Dependencies:** `@actions/core` ^1.10 → **^3.0** (ESM-only — unblocked by esbuild); `@actions/github` ^4.0 → **^9.1** (ESM-only). Now on the latest majors across the board. The "ESM migration deferred" item from earlier in this Unreleased section is no longer outstanding — for a bundled action, esbuild-with-CJS-output is the steady state.
- **Toolchain:** TypeScript ^4.9 → ^5.9; `ts-jest` ^29.0 → ^29.4; `@types/node` ^18 → ^22; explicit `jest` ^29.7 + `@types/jest`.
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
- **Auto-create signatures file actually works now** ([#155](https://github.com/contributor-assistant/github-action/issues/155)). `setupClaCheck.ts:67` compared `error.status === "404"` (string) but octokit returns it as a number, so the create path was unreachable. Every first-time install had to hand-create `cla.json` to get past the cryptic "Could not retrieve repository contents" error. One-character fix.
- **Markdown links in the bot comment** ([#67](https://github.com/contributor-assistant/github-action/issues/67), [PR #171](https://github.com/contributor-assistant/github-action/pull/171)). Signed-committer entries used `(name)[url]` (invalid Markdown) instead of `[name](url)`. Affected both CLA and DCO branches.
- **Bot no longer @-mentions random GitHub users** ([#177](https://github.com/contributor-assistant/github-action/issues/177), dup [#91](https://github.com/contributor-assistant/github-action/issues/91)). When a commit author couldn't be resolved to a GitHub user, the comment rendered `@<raw-git-name>` and could ping an unrelated GitHub login that happened to match. The notSigned list now omits the `@`-prefix for committers without a resolved id; they're still listed by name and surfaced in the "seems not to be a GitHub user" line.
- **Duplicate signature entries** ([#179](https://github.com/contributor-assistant/github-action/issues/179)). `persistence.updateFile` now dedups `newSigned` against existing `signedContributors[].id` before push.
- **Malformed signatures file no longer throws.** `setupClaCheck.prepareCommiterMap` and `persistence.updateFile` defensively default `signedContributors` to `[]` when the file is `{}` or otherwise missing the key.
- **Clearer protected-branch error** ([#131](https://github.com/contributor-assistant/github-action/issues/131), [PR #133](https://github.com/contributor-assistant/github-action/pull/133)). The "Could not update the JSON file" error now points contributors at branch-protection settings, matching the message already used by the create-file path.
- **Skip noisy failures on comments against closed PRs** (closed [#72](https://github.com/contributor-assistant/github-action/issues/72)). `main.ts` short-circuits when the event is `issue_comment` and the parent PR is already closed.
- **Soft-fail when the post-sign workflow re-run can't find itself** ([#135](https://github.com/contributor-assistant/github-action/issues/135)). `getSelfWorkflowId` now returns `null` + emits `core.warning` instead of throwing; the sign flow stays green.

### Removed (cleanup)

- `signed-empty-commit-message` input declared in `action.yml` but unused in source.
- `getEmptyCommitFlag` getter reading an undeclared `empty-commit-flag` input — orphan on both sides.
- `src/shared/pr-sign-comment.ts` — collapsed into the unified comment template.

### Refactored (no observable change)

- **Comment template consolidated.** `cla()` and `dco()` in `pullRequestCommentContent.ts` were 95% duplicated — every comment-text bug had to be fixed twice and historically was only fixed once. Replaced with a single template parameterized by `kind: 'cla' | 'dco'`. The DCO branch's 4-star footer typo (`****DCO Assistant Lite bot****`) is preserved to keep rendered output byte-stable for existing PRs.
- **Hidden HTML-comment marker** (`<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`) appended to every bot comment. The lookup in `pullRequestComment.getComment` prefers this marker, so multiple CLA/DCO jobs in one repo can each find their own comment instead of stomping each other ([#153](https://github.com/contributor-assistant/github-action/issues/153)). Falls back to the legacy substring match for comments posted before markers existed; the next update stamps the marker on, completing migration.
- **Allowlist matcher rewrite** ([#169](https://github.com/contributor-assistant/github-action/issues/169)). `checkAllowList.ts` rewritten to remove the double-negation tangle (`isUserNotInAllowList`) flagged in `CLAUDE.md`. New behavior:
  - **Case-insensitive matching** (GitHub usernames are case-insensitive) — the long-standing `Copilot` vs `copilot` mismatch is fixed.
  - **Wildcards are anchored** (`foo*` matches `foobar` but not `xfoobar`) — the prior unanchored regex would have matched both. Likely-breaking-but-rare case; documented here.
- **`getPullRequestNumber()` helper.** New `src/shared/getPullRequestNumber.ts`; 11 sites that previously read `context.issue.number` directly now route through it. Today it wraps `context.issue.number` 1:1 — the abstraction sets up M5.1 (the `pull-request-number` input for `workflow_run` triggers).
- **`buildCommitMessage()` helper.** Centralized the `$contributorName` / `$pullRequestNo` / `$owner` / `$repo` substitution that was inlined in `persistence.ts`. The new helper uses a global regex so templates referencing the same token twice now replace both sites (the prior `.replace('$contributorName', ...)` only touched the first).

### Added (M4)

- **`exempt-repo-org-members` input** ([#100](https://github.com/contributor-assistant/github-action/issues/100), inspired by [PR #157](https://github.com/contributor-assistant/github-action/pull/157)). When set to `"true"`, members of the repository's owning organization are auto-allowlisted and don't need to sign. Public-org members are visible to the default `GITHUB_TOKEN`; private members require a token with `read:org` scope. Failures (user-owned repo, missing scope, network error) emit a warning and fall through — the CLA check is never blocked by the org lookup.
- **Unsigned-committer details logged to the action output** ([#92](https://github.com/contributor-assistant/github-action/issues/92)). Each unsigned committer's name, email (when present), and GitHub user resolution status is `core.info`-logged so maintainers can identify who still owes a signature — especially useful when the committer can't be resolved to a GitHub login.
- **`$pathToDocument` substitution in `custom-notsigned-prcomment`** ([#113](https://github.com/contributor-assistant/github-action/issues/113)). Custom comment templates can now reference `$pathToDocument` and `$you`; both are replaced everywhere they appear.

### Fixed (M4)

- **Sign phrase in email-reply comments is now detected** ([#19](https://github.com/contributor-assistant/github-action/issues/19)). The detection regex now uses the `m` flag, so a reply via email — where the sign phrase appears on the first line followed by a quoted previous message — matches.

### Docs (M4)

- **README example: `pull_request_target` security hardening callout.** Explicit warning against combining this action's workflow with `actions/checkout` of the PR head ref — the canonical "pwn request" attack.
- **README example: `issue_comment` job-level guard.** Adds `if: github.event.issue.pull_request` so the action doesn't fire on plain-issue comments ([#180](https://github.com/contributor-assistant/github-action/issues/180)).
- **README example: forgiving sign-comment check.** Replaced exact `==` match with `contains(...)` so trailing whitespace, emoji, or quoted email replies still trigger the workflow ([#57](https://github.com/contributor-assistant/github-action/issues/57)).
- **Allowlist case-insensitivity** ([#169](https://github.com/contributor-assistant/github-action/issues/169)) — implementation landed in M3.2's `REFACTOR-ALLOWLIST`; called out here for clarity.

## [2.6.1] and earlier

See the upstream history at [contributor-assistant/github-action](https://github.com/contributor-assistant/github-action/releases) for releases before this fork picked up maintenance.
