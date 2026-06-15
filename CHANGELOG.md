# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — open the next section for ideas in flight._

## [3.0.0] — 2026-06-12

First release of this maintained fork.

### Rebranded

- **Action name: "CLA Assistant Lite" → "Self-Hosted CLA Assistant"** (the brand decided at M7.1). The bot's PR-comment footer is now "Posted by the **Self-Hosted CLA Assistant bot**" (or "Self-Hosted DCO Assistant bot" in DCO mode). Both the v3 brand strings AND the legacy "CLA/DCO Assistant Lite bot" strings are recognized by the existing-comment lookup, so v2.x consumers' in-flight PR comments are picked up on the first v3 run and migrated forward — no orphans.
- The hidden HTML marker (`<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`) keeps its `cla-lite-bot:` prefix as a brand-neutral stable internal identifier. It's invisible to consumers and renaming it would force yet another migration matcher.
- DCO footer dropped its `****` (4-star) Markdown-emphasis typo — preserved through M3.1 for byte-stability with the v2 brand, no longer needed when the brand changes anyway.

### Attribution

The original CLA Assistant work — both the [hosted service](https://github.com/cla-assistant/cla-assistant) and [this Action](https://github.com/contributor-assistant/github-action) — was created by [@ibakshay](https://github.com/ibakshay) and the [`cla-assistant`](https://github.com/cla-assistant) organization. This fork wouldn't exist without their years of work. README, `action.yml`, and the source headers explicitly credit them.

### ⚠️ Breaking changes (v2.x → v3.0.0)

Consolidated summary of every behavior change consumers may notice when upgrading from `contributor-assistant/github-action@v2.6.1` or earlier to this fork's `@v3`. Most are corrections of long-standing bugs — listed here so the change is discoverable rather than surprising.

**Inputs:**
- **`signed-empty-commit-message` input removed** ([M2.9](./.plan/get-well-plan.md)). It was declared in `action.yml` but never read by any code path. Consumers who set it on v2.x: drop the line; behavior is unchanged.

**Behavior corrections that consumers may see in rendered output / git history:**
- **Bot PR comment Markdown.** `(name)[url]` → `[name](url)` for signed-committer links ([upstream #67](https://github.com/contributor-assistant/github-action/issues/67), M2.2). The old form was invalid Markdown and rendered as literal text in most PR clients.
- **Bot stops `@`-mentioning random GitHub users** ([upstream #177](https://github.com/contributor-assistant/github-action/issues/177), M2.3). When a commit author couldn't be resolved to a GitHub login, the action used to render `@<raw-git-name>` and could ping an unrelated GitHub user. The notSigned list now omits `@`-prefix for unresolved committers.
- **Bot PR comment now ends with a hidden HTML marker** (`<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`, M3.5). Invisible in rendered Markdown, but if you scrape the bot's comments by regex this is the new tail.
- **Auto-create signatures file actually works on first install** ([upstream #155](https://github.com/contributor-assistant/github-action/issues/155), M2.1). Pre-v3 the auto-create path was unreachable due to a string-vs-number compare; every first-time install required hand-creating `cla.json` to get past a cryptic "Could not retrieve repository contents" error. v3 just works.
- **No more duplicate entries in cla.json** ([upstream #179](https://github.com/contributor-assistant/github-action/issues/179), M2.4). `signedContributors[]` is now deduped by `id` before writing.
- **Allowlist matching is case-insensitive** ([upstream #169](https://github.com/contributor-assistant/github-action/issues/169), M3.2). `Copilot` now matches `copilot`. If your existing allowlist patterns relied on case-sensitive matching to *exclude* differently-cased usernames, this changes behavior.
- **Allowlist wildcards are anchored** ([M3.2](./.plan/get-well-plan.md)). `foo*` now means "starts with `foo`" instead of "contains `foo`". `xfoox` no longer matches `foo*`. Most consumers won't notice; flagged here for completeness.

**Workflow yaml recommendations (not strictly breaking; current workflows continue to work):**
- The README example workflow now uses `contains(github.event.comment.body, 'I have read the CLA Document...')` instead of `==` — more forgiving of trailing whitespace, emoji, and quoted email replies. Existing exact-match workflows still trigger the action; they're just stricter than necessary.
- The README example workflow now has an explicit `if: github.event.issue.pull_request` guard so the action doesn't fire on plain-issue comments ([upstream #180](https://github.com/contributor-assistant/github-action/issues/180)).

**Intentionally NOT changed** (considered, rejected):
- `branch` input default stays `master`. We considered defaulting to `main` (which GitHub itself defaults to for new repos since 2020), but the silent break for `master`-based consumers who don't set the input outweighs the convenience. Set the input explicitly to suppress.
- `lock-pullrequest-aftermerge` default stays `true`. Locking is a security-relevant default (prevents post-merge signature revocation); changing the default to `false` would silently downgrade behavior for every existing consumer.
- `allowlist` input not renamed to `allowlist-users`. Considered for clarity vs. the new `exempt-repo-org-members`, but the rename costs every consumer a yaml edit for marginal disambiguation. The two inputs are clearly distinguished by name as-is.

**Runtime requirements:**
- **Node 24** runtime (`action.yml`: `using: node24`). Self-hosted runners on Node 20 or earlier will fail with a "not supported" message at action start. Standard GitHub-hosted runners have Node 24 since late 2025.



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

- **Comment template consolidated.** `cla()` and `dco()` in `pullRequestCommentContent.ts` were 95% duplicated — every comment-text bug had to be fixed twice and historically was only fixed once. Replaced with a single template parameterized by `kind: 'cla' | 'dco'`. The DCO branch's 4-star footer typo (`****DCO Assistant Lite bot****`) was held byte-stable through this refactor for safety; it was dropped together with the brand change in M7.1 (see the Rebranded section above).
- **Hidden HTML-comment marker** (`<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`) appended to every bot comment. The lookup in `pullRequestComment.getComment` prefers this marker, so multiple CLA/DCO jobs in one repo can each find their own comment instead of stomping each other ([#153](https://github.com/contributor-assistant/github-action/issues/153)). Falls back to the legacy substring match for comments posted before markers existed; the next update stamps the marker on, completing migration.
- **Allowlist matcher rewrite** ([#169](https://github.com/contributor-assistant/github-action/issues/169)). `checkAllowList.ts` rewritten to remove the double-negation tangle (`isUserNotInAllowList`) flagged in `CLAUDE.md`. New behavior:
  - **Case-insensitive matching** (GitHub usernames are case-insensitive) — the long-standing `Copilot` vs `copilot` mismatch is fixed.
  - **Wildcards are anchored** (`foo*` matches `foobar` but not `xfoobar`) — the prior unanchored regex would have matched both. Likely-breaking-but-rare case; documented here.
- **`getPullRequestNumber()` helper.** New `src/shared/getPullRequestNumber.ts`; 11 sites that previously read `context.issue.number` directly now route through it. Today it wraps `context.issue.number` 1:1 — the abstraction sets up M5.1 (the `pull-request-number` input for `workflow_run` triggers).
- **`buildCommitMessage()` helper.** Centralized the `$contributorName` / `$pullRequestNo` / `$owner` / `$repo` substitution that was inlined in `persistence.ts`. The new helper uses a global regex so templates referencing the same token twice now replace both sites (the prior `.replace('$contributorName', ...)` only touched the first).

### Added (M5)

- **`pull-request-number` input** ([M5.1](./.plan/get-well-plan.md)). Override the PR number the action operates on. Required when the workflow is triggered by `workflow_run` or any non-PR event. Invalid values (non-numeric, zero, negative) emit a warning and fall through to `context.issue.number`.
- **GitHub App authentication** ([M5.2](./.plan/get-well-plan.md)). New `github-app-id` input + `GITHUB_APP_PRIVATE_KEY` env var. When both are set, the action authenticates as the App's installation in place of `GITHUB_TOKEN` / `PERSONAL_ACCESS_TOKEN`. App auth wins everywhere it can. Installation id is auto-discovered via `apps.getRepoInstallation`; `github-app-installation-id` input pins it explicitly (saves ~200ms per run, recommended for production). On any App-config failure, the action emits a warning and falls back to the default token — App misconfig never breaks a workflow that could otherwise succeed.
- **`@octokit/auth-app@^8`** added as a direct dependency. ~50 KB bundle impact via `universal-github-app-jwt`.
- **`bot-name` + `bot-email` inputs** ([M5.3](./.plan/get-well-plan.md)). Override the author/committer identity on signature commits. Must be set together; setting only one emits a warning and uses the token default. Useful with App auth when you want a stable bot identity across runs (e.g. `cla-bot <cla-bot@example.com>` instead of the App's autogenerated `<app-id>+<slug>[bot]@users.noreply.github.com`).
- **`docs/cla-app-manifest.json`** — reference App manifest with the exact permission + event set this action needs. Use as a checklist when creating the App manually; will be submitted programmatically by the planned `create-cla-action-config` `npx` bootstrap (v3.1.x).
- **README "Authentication" section** documenting App auth (recommended), `GITHUB_TOKEN` (default), and `PERSONAL_ACCESS_TOKEN` (legacy/discouraged). PAT-using consumers continue to work without changes.
- **README "Troubleshooting & setup gotchas" section** ([M5.4](./.plan/get-well-plan.md)) covering branch-protection on the signatures branch, PAT classic vs fine-grained guidance, org-owned-PAT 500-error pitfall, `issue_comment` event filtering, and the v2-era broken-Markdown-link symptom.

### Added (M6)

- **Documented defaults for every input** ([M6.4](./.plan/get-well-plan.md)). README's "Inputs" table now shows a `Default` column alongside each input; absent default = required. `action.yml` is the source of truth.
- **DCO parity in action.yml + README banner** ([M6.5](./.plan/get-well-plan.md)). Input descriptions now mention "CLA/DCO" rather than CLA-only; README's top-of-file callout tells DCO users that everything else applies modulo terminology.
- **OpenSSF Scorecard workflow** ([M6.8](./.plan/get-well-plan.md)). `.github/workflows/scorecard.yml` runs weekly, publishes to securityscorecards.dev, and uploads SARIF results to code-scanning. Read-only at the top level; per-job least-privilege. SHA-pinned per M1.16.

### Deferred to v3.1.x

These M6 items aren't on the critical path for v3.0 and ship later:
- `FEAT-ALLOWLIST-TEAMS` — team-based allowlist (`@org/team` entries)
- `FEAT-ALLOWLIST-FROM-FILE` — `allowlist-file:` input for long lists
- `FEAT-LABELS` — read/write CLA-status labels on PRs
- `FEAT-CSV-MIGRATION-SCRIPT` — convert cla-assistant.io CSV exports to our JSON

### Changed (M5)

- **`src/octokit.ts` is now an async factory** instead of a synchronous singleton. The bare `octokit` export is gone; consumers call `await getOctokit()` or `await getStorageOctokit({isCrossRepo})`. Behavior unchanged for the GITHUB_TOKEN and PAT paths; this is the foundation for App-auth's network-bound token mint.

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
