# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is **archived / no longer actively maintained** (see the banner in `README.md`). The action remains functional and consumers continue to pin to released versions (`contributor-assistant/github-action@v2.x`). Existing forks (e.g. `contributor-assistant/github-action`) are where active development lives.

## Commands

- `npm ci` — install dependencies (CI uses this; `package-lock.json` is the source of truth).
- `npm run build` — runs `tsc` then `ncc build`, bundling everything into `dist/index.js`. **`dist/index.js` is the action's runtime** and must be checked in.
- `npm test` — runs Jest (config in `jest.config.js`, matches `**/*.test.ts`, uses `ts-jest`).
- `npx jest __tests__/pullRequestLock.test.ts` — run a single test file.
- `npx jest -t "lock pull request"` — run tests matching a name.

A Husky `pre-commit` hook (`package.json` → `husky.hooks.pre-commit`) runs `npm run buildAndAdd` to rebuild `dist/` and `git add .` on every commit. If the hook is bypassed, the committed `dist/index.js` will drift from `src/`.

**Heads-up:** the test files in `__tests__/` (`main.test.ts`, `pullRequestLock.test.ts`) import paths that no longer exist after a refactor (`../src/checkcla`, `../src/pullRequestLock` — actual paths are `src/setupClaCheck.ts` and `src/pullrequest/pullRequestLock.ts`). Tests do not currently run cleanly; CI in `.github/workflows/nodejs.yml` only runs `npm run build`, not `npm test`. Treat the existing tests as stale rather than authoritative.

## Architecture

This is a GitHub Action implemented in TypeScript. The bundled `dist/index.js` is invoked by GitHub Actions runtime (Node 20, see `action.yml`).

### Entry point and dispatch

`src/main.ts` → `run()` dispatches on the webhook payload:

- `payload.action === 'closed'` **and** `lock-pullrequest-aftermerge` input is `'true'` → `lockPullRequest()` locks the PR conversation so signature comments cannot be edited after merge.
- Otherwise → `setupClaCheck()` runs the signature reconciliation flow.

All action inputs are read via `core.getInput(...)` wrappers in `src/shared/getInputs.ts`. Booleans are passed as string `'true'`/`'false'` because GitHub Actions inputs cannot be typed booleans — code does string comparisons against these literals (see `main.ts`, `signatureComment.ts`).

### Signature reconciliation flow (`setupClaCheck.ts`)

1. **Fetch committers** of the PR via GraphQL (`src/graphql.ts`). Resolves each commit's author/committer to a GitHub user where possible; deduplicates by name. Hardcoded filter `committer.id !== 41898282` strips the `github-actions[bot]` account so the action itself never needs to sign.
2. **Apply allowlist** (`src/checkAllowList.ts`) — comma-separated `allowlist` input, supports `*` wildcards (translated to regex via `lodash.escapeRegExp`). Note the predicate name `isUserNotInAllowList` is misleading; it returns `true` when the user **matches** the allowlist, and the filter expression in `checkAllowList` is double-negated — read carefully before changing.
3. **Load (or create) the signatures file** via `src/persistence/persistence.ts`. The file is JSON of shape `{ signedContributors: [...] }`. Location is determined by inputs `path-to-signatures` / `branch`, and optionally `remote-organization-name` + `remote-repository-name` for storage in a different repo.
4. **Build a `CommitterMap`** (`signed` / `notSigned` / `unknown`) by intersecting committers with `signedContributors[].id`.
5. **Post or update the bot PR comment** (`src/pullrequest/pullRequestComment.ts`). The comment is identified by matching `/CLA Assistant Lite bot/` or `/DCO Assistant Lite bot/` in existing comments — **changing those strings in `pullRequestCommentContent.ts` will orphan existing bot comments on live PRs**.
6. **Detect new signatures** in PR comments (`src/pullrequest/signatureComment.ts`). A comment counts as a signature when the body matches the regex for "I have read the CLA/DCO Document and I hereby sign the CLA/DCO" (whitespace-flexible), or matches `custom-pr-sign-comment` if set. The `github-actions[bot]` author is always excluded.
7. **If there are newly signed committers**, append them to `signedContributors[]` and commit the updated file via `octokit.repos.createOrUpdateFileContents`. Commit message template substitutes `$contributorName`, `$pullRequestNo`, `$owner`, `$repo`.
8. **If all committers are signed**, call `reRunLastWorkFlowIfRequired()` (`src/pullRerunRunner.ts`) to re-run the last failed workflow run on the PR branch. This exists because the check posted by this action runs under `pull_request_target` (against the base repo), so external status checks on the contributor's branch don't auto-refresh — see the comment linking to issue #39.
9. **Otherwise** `core.setFailed(...)` to mark the action red so the PR is blocked.

### Octokit clients (`src/octokit.ts`)

Two tokens, two clients:

- `GITHUB_TOKEN` (env) → default client. Used for all PR-side operations (listing/creating/updating comments, locking PRs, reading committers, re-running workflows).
- `PERSONAL_ACCESS_TOKEN` (env) → only used when `remote-organization-name` or `remote-repository-name` is configured, i.e. the signatures file lives outside the PR's repo. The default `GITHUB_TOKEN` cannot cross repo boundaries, so this PAT (with `repo` scope) is required.

`persistence.ts` picks between them via `isRemoteRepoOrOrgConfigured()`. The top-level `octokit` singleton in `octokit.ts` always uses `GITHUB_TOKEN`.

### Inputs and customization

All inputs are declared in `action.yml`. The action distinguishes CLA mode from DCO mode purely via the `use-dco-flag` string input — affects regex used to detect signatures, the bot signature in comments, and the default comment text. There is no migration path: switching modes on an existing repo will orphan prior signatures and the bot comment.

## Conventions

- **TypeScript**: `strict: true`, but `noImplicitAny: false` and `useUnknownInCatchVariables: false` — `error` in catch blocks is implicitly `any`, and access patterns like `error.status === "404"` (string!), `error.message` are pervasive. Don't tighten this without auditing every catch block.
- **Prettier**: 2 spaces, no semicolons, single quotes, no trailing commas, `arrowParens: avoid` (`.prettierrc.json`).
- **Filenames**: `camelCase.ts` (e.g. `setupClaCheck.ts`, `pullRequestLock.ts`).
- **No dependency injection** for octokit/context — most modules pull from the `@actions/github` global `context` and the `octokit` singleton directly. This is why the tests as written mock entire modules.
