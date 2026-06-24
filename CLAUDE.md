# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is a **maintained fork** of the (now-archived) [`contributor-assistant/github-action`](https://github.com/contributor-assistant/github-action), itself a continuation of `cla-assistant/github-action`. Active development happens here; consumers should pin to `badideasforsale/cla-github-action@v3` (or a 40-char SHA). See `README.md` for the user-facing banner and `CHANGELOG.md` for the v3 change set.

## Commands

- `npm ci` — install dependencies (CI uses this; `package-lock.json` is the source of truth).
- `npm run build` — runs `tsc` then `esbuild`, bundling everything into `dist/index.js`. **`dist/index.js` is the action's runtime** and must be checked in.
- `npm test` — runs Jest (config in `jest.config.js`, matches `**/*.test.ts`, uses `ts-jest`).
- `npx jest __tests__/pullRequestLock.test.ts` — run a single test file.
- `npx jest -t "lock pull request"` — run tests matching a name.

There is no pre-commit hook. The `verify-dist` job in `.github/workflows/nodejs.yml` rebuilds `dist/` and fails any PR where the result diverges from what's committed, so the rebuild must happen manually before pushing.

## Architecture

This is a GitHub Action implemented in TypeScript. The bundled `dist/index.js` is invoked by GitHub Actions runtime (Node 24, see `action.yml`).

### Entry point and dispatch

`src/main.ts` → `run()` dispatches on the webhook payload:

- `payload.action === 'closed'` **and** `payload.pull_request?.merged === true` **and** `lock-pullrequest-aftermerge` input is `'true'` → `lockPullRequest()` locks the PR conversation so signature comments cannot be edited after merge. The `merged === true` gate (SF-20) prevents lock-on-close-without-merge — a contributor closing their own unmerged PR is left able to reopen and iterate.
- `eventName === 'issue_comment'` **and** `payload.issue.state === 'closed'` → short-circuit. Avoids the noisy failures the action used to produce when run against comments on already-closed PRs.
- Otherwise → `setupClaCheck()` runs the signature reconciliation flow.

All action inputs are read via `core.getInput(...)` wrappers in `src/shared/getInputs.ts`. Booleans are passed as string `'true'`/`'false'` because GitHub Actions inputs cannot be typed booleans — code does string comparisons against these literals (see `main.ts`, `signatureComment.ts`).

### Signature reconciliation flow (`setupClaCheck.ts`)

1. **Fetch committers** of the PR via GraphQL (`src/graphql.ts`). Resolves each commit's author/committer to a GitHub user where possible; deduplicates by name. Hardcoded filter `committer.id !== 41898282` strips the `github-actions[bot]` account so the action itself never needs to sign. **Pagination is mandatory** (SEC-PAGINATE-COMMITS): the query asks for `first: 100, after: $cursor` and the function loops until `hasNextPage === false`, with a 50-page / 5000-commit safety cap. Pre-fix code stopped at page one and let attackers bypass the check by padding PRs.
2. **Apply allowlist** (`src/checkAllowList.ts` + `src/allowlistOrgsAndTeams.ts`) — comma-separated `allowlist` input. Four entry shapes: plain login, wildcard (`bot*`, anchored), `@org` (every member), `@org/team` (every member incl. child teams). Org/team entries resolve via paginated GraphQL; failure is per-entry soft (warn + continue, never blocks). Case-insensitive matching throughout. Optionally followed by `applyOrgExemption()` (`src/orgExemption.ts`) which is the shorthand for `@${context.repo.owner}` when `exempt-repo-org-members: 'true'`.
3. **Load (or create) the signatures file** via `src/persistence/persistence.ts`. The file is JSON of shape `{ signedContributors: [...] }`. Location is determined by inputs `path-to-signatures` / `branch`, and optionally `remote-organization-name` + `remote-repository-name` for storage in a different repo.
4. **Build a `CommitterMap`** (`signed` / `notSigned` / `unknown`) by intersecting committers with `signedContributors[].id`.
5. **Post or update the bot PR comment** (`src/pullrequest/pullRequestComment.ts`). The lookup is **filtered by the bot's authenticated identity** (SEC-COMMENT-AUTHOR-FILTER): only comments authored by `github-actions[bot]` (under `GITHUB_TOKEN`) or `<app-slug>[bot]` (under App auth) are considered. Without this filter any PR opener can DoS the action by pasting the marker or brand substring into a comment of their own. Among those candidates, identification prefers a hidden HTML marker (`<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`, M3.5) that's appended to every v3-rendered comment. The marker enables multi-job safety. Falls back to a brand-string regex that matches **either** `Self-Hosted CLA/DCO Assistant bot` (v3) **or** `CLA/DCO Assistant Lite bot` (v2/upstream) — preserves continuity across the v2→v3 brand change. Changing either the marker prefix or the brand strings will orphan in-flight PR comments, so both should be considered stable identifiers.
6. **Detect new signatures** in PR comments (`src/pullrequest/signatureComment.ts`). A comment counts as a signature when the body matches the regex for "I have read the CLA/DCO Document and I hereby sign the CLA/DCO" (whitespace-flexible), or matches `custom-pr-sign-comment` if set. The `github-actions[bot]` author is always excluded.
7. **If there are newly signed committers**, append them to `signedContributors[]` and commit the updated file via `octokit.repos.createOrUpdateFileContents`. Commit message template substitutes `$contributorName`, `$pullRequestNo`, `$owner`, `$repo`.
8. **If all committers are signed**, call `reRunLastWorkFlowIfRequired()` (`src/pullRerunRunner.ts`) to re-run the last failed workflow run on the PR branch. This exists because the check posted by this action runs under `pull_request_target` (against the base repo), so external status checks on the contributor's branch don't auto-refresh — see the comment linking to issue #39.
9. **Otherwise** `core.setFailed(...)` to mark the action red so the PR is blocked.

### Octokit clients (`src/octokit.ts`)

Async factory pattern with three auth modes. `getOctokit()` returns the PR-side client; `getStorageOctokit({isCrossRepo})` returns the signatures-file client. Both are module-level memoized — at most one client per mode per run.

Auth precedence:

1. **GitHub App** (recommended) — when `github-app-id` input + `GITHUB_APP_PRIVATE_KEY` env var are both set. Mints an installation token via `@octokit/auth-app`. Wins everywhere it can — primary AND storage. Installation id pinned via `github-app-installation-id` input or auto-discovered via `apps.getRepoInstallation` (one extra API call). On any App-config failure, warns + falls through to lower-precedence auth — never `setFailed`.
2. **`PERSONAL_ACCESS_TOKEN`** (env) — only relevant for `getStorageOctokit` when cross-repo storage is configured (`remote-organization-name` or `remote-repository-name`). Required `repo` scope. Never used for the PR-side client.
3. **`GITHUB_TOKEN`** (env) — default. Used by all PR-side operations and by storage when same-repo + no App auth.

`getExpectedCommenterLogin()` returns the bot's login (`github-actions[bot]` under `GITHUB_TOKEN`; `<app-slug>[bot]` under App auth via `apps.getAuthenticated()`). Used by `getComment()` for the SEC-COMMENT-AUTHOR-FILTER described above. Memoized.

`persistence.ts` picks between `getStorageOctokit({isCrossRepo: ...})` based on whether `remote-organization-name`/`remote-repository-name` are configured.

### Inputs and customization

All inputs are declared in `action.yml`. The action distinguishes CLA mode from DCO mode purely via the `use-dco-flag` string input — affects regex used to detect signatures, the bot signature in comments, and the default comment text. There is no migration path: switching modes on an existing repo will orphan prior signatures and the bot comment.

## Conventions

- **TypeScript**: `strict: true`, but `noImplicitAny: false` and `useUnknownInCatchVariables: false` — `error` in catch blocks is implicitly `any`, and access patterns like `error.status === "404"` (string!), `error.message` are pervasive. Don't tighten this without auditing every catch block.
- **Prettier**: 2 spaces, no semicolons, single quotes, no trailing commas, `arrowParens: avoid` (`.prettierrc.json`).
- **Filenames**: `camelCase.ts` (e.g. `setupClaCheck.ts`, `pullRequestLock.ts`).
- **No dependency injection** for octokit/context — most modules pull from the `@actions/github` global `context` and the `octokit` factory (`src/octokit.ts`) directly. This is why the tests as written mock entire modules.

## Process rules for AI agents

These are non-negotiable for any agent doing work in this repo. Both rules exist because past releases of upstream `contributor-assistant/github-action` shipped with avoidable security and doc-staleness issues — see the security section in `CHANGELOG.md` `[3.0.0]` and the swept-clean SAP boilerplate from `CONTRIBUTING.md`.

### 1. Documentation review with every change

Every PR or commit set, no matter how small, must include a documentation sweep before it ships:

- Cross-check claims in `README.md`, `MIGRATION.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CLAUDE.md` itself, and `docs/*` against the actual code state.
- If a feature was added, changed, renamed, or removed, find every doc that references it and update accordingly.
- Look for stale links, broken internal anchors, contradictions across files, and references to deprecated tooling (e.g. `husky`, `ncc`, `node20`, SAP boilerplate).
- `action.yml`'s input descriptions are the source of truth for any input the README discusses; they must stay in sync.
- Doc edits land alongside the code change, in the same PR — not as a follow-up.

When in doubt, run the documentation-sync audit pattern: read each user-facing doc top-to-bottom against current `src/` and `action.yml`, flag staleness, fix. The previous release of v3.0.0 caught several stale claims this way (`CLAUDE.md` claimed the repo was archived; `CONTRIBUTING.md` pointed at `secure@sap.com`; CHANGELOG referenced `ncc build` after the esbuild swap) — these would have shipped to v2.x consumers as confusing fork-onboarding noise.

### 2. Security review before every version release

Before pushing a `vN.N.N` tag (or `vN.N`/`vN` floating tag move), an explicit security pass is required:

- Source code audit covering token & secret handling (`GITHUB_TOKEN`, `PERSONAL_ACCESS_TOKEN`, `GITHUB_APP_PRIVATE_KEY`), injection vectors (template substitutions, contributor-controlled strings flowing into Markdown / `core.info` / shell), GraphQL query construction, regex correctness + ReDoS, authorization scope, comment-author filtering.
- Supply-chain audit covering bundle composition (`dist/index.js` reproducibility from `npm ci && npm run build`), direct dependency authenticity (`@actions/core`, `@actions/github`, `@octokit/auth-app`, anything added since the last release), transitive surface, lockfile integrity, `npm audit --omit=dev` cleanliness, SHA-pinning of every third-party `uses:` in `.github/workflows/*`, and CI supply-chain (release.yml clean rebuild + provenance attestation).
- Either run the `security-research` plugin's orchestrator or spawn dedicated review agents — both are documented patterns. Don't skip the review because "the last one was clean": new code introduces new surface (e.g. the M5.2 App-auth code path doubled the secret-handling surface).
- Findings triage: any Medium-or-higher severity blocks the tag. Low / informational findings either land before tag (preferred) or get an explicit follow-up patch slot.
- The audit report itself doesn't need to be committed, but the findings + their fixes do — every fix gets a paired regression test and lands as its own commit (one CVE-class issue per commit, so consumers reading the log can map fixes to advisories cleanly).

The v3.0.0 cycle caught four pre-release findings (SEC-COMMENT-AUTHOR-FILTER, SEC-PAGINATE-COMMITS, SEC-ESCAPE-AUTHOR-NAME, SEC-STRIP-NEWLINES) — two of them release-blocking. Without the security pass these would have shipped.
