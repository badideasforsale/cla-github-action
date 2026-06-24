# Post-v3 review — improvements log

**Generated:** 2026-06-24, from four parallel review agents covering documentation, code comments, security (pass 2), and bugs/correctness.

**Triage:** every claim is reviewed; spot-verifications noted where they happened. False positives are listed separately at the bottom so future-me can see what was checked.

**Status note:** v3.0.0 hasn't tagged yet. One item below (`#TAG-1`) is genuinely tag-blocking; the rest are post-release backlog (v3.0.x for "should-fix", v3.1+ for "polish").

---

## TAG-BLOCKERS — verify and fix before `v3.0.0`

### TAG-1 · CLA bypass via `getCommitters` dedup-by-name collision — ✅ FIXED in `3afcb68`

- **Severity:** Medium (security)
- **Source:** security audit (FIND-SEC-DEDUP-NAME-COLLISION)
- **Location:** `src/graphql.ts:87` (the `seenNames.has(user.name)` check)
- **Verified:** Read code at that exact line. Confirmed. Dedup key is `user.name` only.

**Attack.** `user.name = committer.login || committer.name`. For commits with a resolved GitHub user, `.name` is the login (alphanumeric+hyphen). For commits with an unresolved author header, `.name` is the raw git author string — fully attacker-controlled. The two namespaces collapse into the same `Set<string>`.

An external contributor can:
1. Observe a signed contributor's GitHub login in the PR's first commit (e.g. `alice`).
2. Push additional commits with `git commit --author "alice <attacker@example.com>"` where `attacker@example.com` is not linked to any GitHub account.
3. The second commit deserializes to `{name: "alice", id: '', ...}`. The dedup sees `"alice"` already in `seenNames` (from the resolved-login commit) and **silently drops** the unresolved committer.
4. The CLA check sees only `alice` (id 12345, already signed). Passes. Malicious commit lands.

This is pre-existing — v2.x has the same flaw — but v3.0.0 is being tagged with four `fix(security)` commits in its release notes; shipping a fifth known-medium CLA bypass under that banner is inconsistent.

**Fix.** Compose the dedup key from `(id, name)` rather than `name` alone. Pseudocode:
```ts
const key = user.id ? `id:${user.id}` : `raw:${user.name}:${user.email ?? ''}`
if (!seenKeys.has(key)) { seenKeys.add(key); committers.push(user) }
```
This keeps the resolved-by-login dedup (id-keyed) and the unresolved-by-name dedup (email-disambiguated, since real distinct contributors will have distinct emails) cleanly separated.

Add a regression test that asserts: PR with `[{login: 'alice', id: 12345}, {name: 'alice', id: '', email: 'attacker@example.com'}]` produces TWO committers, not one.

---

## SHOULD-FIX — land in v3.0.x patch series

Each below is a real correctness or behavior issue, but not severe enough to block the tag. Numbered for tracking; not ordered by priority within this section.

### SF-1 · Signature regex fails on tab whitespace — ✅ FIXED in `398d692`

- **Source:** bugs review (#4)
- **Location:** `src/pullrequest/signatureComment.ts:76-78`
- **Verified:** read the regex `/^.*i \s*have \s*read \s*the \s*cla \s*document \s*and \s*i \s*hereby \s*sign \s*the \s*cla.*$/m` — each separator is a literal space followed by `\s*`. Tab-only between words won't match.

A contributor who pastes the sign phrase with tabs (or whose paste pipeline converts spaces to tabs — enterprise email gateways do this) silently fails the sign. Replace each `<literal-space>\s*` with `\s+`. Add `s` flag if you want the phrase to span line-wraps.

### SF-2 · `listComments` not paginated — signs miss on verbose PRs — ✅ FIXED in `925979e`

- **Source:** bugs review (#22)
- **Location:** `src/pullrequest/signatureComment.ts:13-17` and `src/pullrequest/pullRequestComment.ts:64`
- **Plausibility:** GitHub's default page size is 30 comments. Long PRs with extensive discussion can push the sign comment past page 1.

Replace direct `octokit.rest.issues.listComments(...)` with `octokit.paginate(octokit.rest.issues.listComments, ...)`. Affects both the "find the bot comment" lookup and the "scan all comments for sign phrases" scan.

### SF-3 · `path-to-signatures` triple inconsistency — ✅ FIXED (default changed; documented as breaking)

- **Source:** docs review (#1)
- **Locations:** README inputs-table (line 213), README body (line 111), README workflow example (line 60), `action.yml` (line 10).

Three different "defaults" are stated: `./signatures/cla.json` (action.yml + table), `signatures/version1/cla.json` (body prose + example). Pick one. The `action.yml` value is the actual default; either the prose and the example should align with it, or change `action.yml`.

### SF-4 · `branch` default mismatch: example shows `'main'`, default is `'master'` — ✅ FIXED (default changed; documented as breaking)

- **Source:** docs review (#2)
- **Locations:** README example (line 63) and `action.yml` (line 13).

Consumers copy-paste the example with `'main'`; consumers who don't set the input get `'master'`. CHANGELOG `Intentionally NOT changed` says the `master` default stays for back-compat. Either the example needs a comment explaining this, or both options should appear in the example commented out.

### SF-5 · `signed-commit-message` / `create-file-commit-message` defaults documented but absent from `action.yml`

- **Source:** docs review (#3)
- **Locations:** README inputs table claims defaults; `action.yml` has no `default:` for these inputs.

Either move the actual defaults into `action.yml`'s `default:` fields (so `gh action view` surfaces them) or change the README table to say `_(empty — uses internal default)_` and document the default text in prose only.

### SF-6 · First-install gotcha: workflow-permissions read-only at org/repo level

- **Source:** docs review (#7)
- **Location:** README missing this; only buried in a YAML comment.

The single most common first-install failure is "Settings → Actions → General → Workflow permissions" defaulting to read-only at the org level, which overrides per-workflow `permissions:`. Add a one-line step before "Configure within two minutes" explaining this. The smoke-test plan already does (Step 0).

### SF-7 · No "verify it works" step in setup walkthrough

- **Source:** docs review (#8)
- **Location:** README "Configure within two minutes" — ends at step 6 (Authentication).

Add a step 7: "open a PR from a sock-puppet account, expect the bot to post a please-sign comment, sign with the phrase, expect ✓ and a commit to the signatures file." This is the Tier-1 smoke-test path condensed for consumers.

### SF-8 · Cross-repo signature storage: only one of two required inputs validated

- **Source:** bugs review (#6)
- **Location:** `src/persistence/persistence.ts` and `isRemoteRepoOrOrgConfigured()`

If a consumer sets `remote-organization-name` but forgets `remote-repository-name` (or vice versa), the action falls back per-field to `context.repo.owner`/`repo`, writing signatures to a misconfigured location. Validate at startup: both or neither.

### SF-9 · `JSON.parse` on directory `path-to-signatures` crashes cryptically

- **Source:** bugs review (#2)
- **Location:** `src/setupClaCheck.ts:87-89`

`octokit.rest.repos.getContent` returns an array for directories. `result.data.content` is then undefined; `Buffer.from(undefined, 'base64')` throws. Validate `result.data` is an object with a string `content` before parsing; otherwise emit a clear "did you mean to point at a file?" error.

### SF-10 · `pullRequestLock` swallows failures with `core.error`, action exits 0

- **Source:** bugs review (#13) and code-comments review (#25)
- **Location:** `src/pullrequest/pullRequestLock.ts:19-22`

When the lock fails (e.g. token lacks `issues: write`), the action `core.error`s but doesn't `setFailed`. Workflow exits green even though the explicit `lock-pullrequest-aftermerge: 'true'` contract was not fulfilled. Either `setFailed` on lock failure or document the best-effort semantics with a top-of-file comment.

### SF-11 · `commit.author.user` dereferenced without null check on orphan commits

- **Source:** bugs review (#21) and code-comments review (#10)
- **Location:** `src/graphql.ts:110` — `extractUserFromCommit`

`commit.author.user || commit.committer.user || commit.author || commit.committer`. If `commit.author` is `null` (rare but exists for orphan/unauthored commit history), this throws. Defensive optional chains on each access.

### SF-12 · `bot-name`/`bot-email` half-config: empty-string vs unset

- **Source:** bugs review (within #9 area)
- **Location:** `src/persistence/persistence.ts:24-35` (the half-config-warns logic)

Empty-string vs unset behave the same in `core.getInput`, but a consumer who sets `bot-name: ''` explicitly may expect different behavior than omitting the input. Confirm + document. Low priority.

### SF-13 · `pull-request-number` validation — silently accepts `"12abc"`

- **Source:** bugs review (#14)
- **Location:** `src/octokit.ts:156-164` (and similar in `getPullRequestNumber.ts`)

`parseInt("12abc", 10)` returns `12`. Use `Number(input.trim())` + `Number.isInteger && > 0` to reject typos with a clear warning.

### SF-14 · MIGRATION.md missing the four security fixes

- **Source:** docs review (#12)
- **Location:** `MIGRATION.md` Step 2.

Upgraders running security review on the v2→v3 transition need a breadcrumb to the CHANGELOG `Security` block, not just the visible-behavior table. Add a "Security fixes you'll inherit" subsection.

### SF-15 · README/CHANGELOG worked examples missing for the v3 features

- **Source:** docs review (#9)
- **Locations:** README has only the basic same-repo setup. Missing: cross-repo storage, App auth full yaml, DCO mode full yaml, `workflow_run` with `pull-request-number`, `@org`/`@org/team` allowlist.

Add an Examples section. Even collapsed `<details>` blocks per recipe are better than nothing.

### SF-16 · `recheck` keyword used in example yaml but never documented

- **Source:** docs review (#10)
- **Location:** README example workflow contains `recheck` as a trigger phrase; no doc explains what it does or when to use it.

Document in README troubleshooting: "post `recheck` as a PR comment to manually re-trigger the action without a code change."

### SF-17 · SECURITY.md uses future tense for build provenance that v3.0.0 actually ships

- **Source:** docs review (#18)
- **Location:** `SECURITY.md:34` — "Releases will publish build provenance attestations".

Replace "will" with "publish, starting v3.0.0". Add a concrete `gh attestation verify` example.

### SF-18 · App-auth debugging not documented in troubleshooting

- **Source:** docs review (#16)
- **Location:** README troubleshooting.

The action falls back to `GITHUB_TOKEN` on App-config failure and emits a warning. Tell operators: what log line to grep for, what successful App auth looks like in commit-author identity, how to confirm the installation id resolved.

### SF-19 · Workflow-marker fragility on `name:` containing `-->`

- **Source:** security audit pass 2 (FIND-INFO-COMMENT-MARKER-BREAK)
- **Location:** `src/pullrequest/pullRequestCommentContent.ts:21-25`

If a consumer's `name:` in workflow yaml contains `-->`, the marker `<!-- cla-lite-bot:cla:<workflow>:<job> -->` is closed prematurely. Multi-job-safety degrades to legacy-substring matching. Not a security boundary (workflow yaml is admin-controlled) but silently breaks an invariant. Sanitize `>` out of slug or warn at startup if detected.

### SF-20 · `lockPullRequest` fires on close-without-merge

- **Source:** security audit pass 2 (FIND-INFO-LOCK-BEFORE-MERGE)
- **Location:** `src/main.ts:15-20`

The input is `lock-pullrequest-aftermerge` but the code checks `action === 'closed'` without `payload.pull_request.merged`. A contributor who closes their own PR (e.g. to reopen with different commits) auto-locks themselves out. Gate on `merged === true`.

### SF-21 · "Two distinct contributors share git author name" → silently deduped

- **Source:** bugs review (#7) — partial overlap with TAG-1 but distinct attack surface
- **Location:** `src/graphql.ts:87`

Same dedup-by-name issue, different impact: two genuine contributors with same git config display name (e.g. two "John Smith"s, or CI bot accounts with generic names) collapse to one. Non-malicious but produces wrong CLA results. Fixed by the same change as TAG-1.

---

## POLISH — code-comment, type, naming cleanups (v3.1+)

Most of these are individual findings from the code-comments review. Grouped to keep the log readable.

### P-1 · Rename `prepareCommiterMap` → `prepareCommitterMap`

- **Source:** code-comments review (#3)
- **Locations:** `src/setupClaCheck.ts:123, 147` and `src/pullrequest/pullRequestComment.ts:101`

Misspelling appears in two files. Major version is the right moment.

### P-2 · Type `claFileContent` and `committerMap` properly instead of `any`

- **Source:** code-comments review (#4, #19, #33)
- **Locations:** `src/setupClaCheck.ts:125`, `src/persistence/persistence.ts:51, 70`, `src/interfaces.ts:40`

Introduce a `ClaFile` type alongside `ClafileContentAndSha`. Use throughout. Eliminates the `any` pass-through chain.

### P-3 · Delete dead types in `interfaces.ts`

- **Source:** code-comments review (#32)
- **Location:** `src/interfaces.ts:11-15, 27-30, 31-38`

`CommentedCommitterMap` (identical to `ReactedCommitterMap`), `LabelName`, `CommittersCommentDetails` — all exported, none imported outside the interfaces file itself.

### P-4 · Stale "PAT required" comment in `pullRerunRunner.ts`

- **Source:** code-comments review (#30)
- **Location:** `src/pullRerunRunner.ts:98`

Comment says "Personal Access token with repo scope is required". Post-M5.2 the function uses `getOctokit()` which can be App / GITHUB_TOKEN / PAT. Re-run with default `GITHUB_TOKEN` works under `pull_request_target`. Update or delete.

### P-5 · Magic `41898282` in `graphql.ts` needs an inline comment

- **Source:** code-comments review (#8)
- **Location:** `src/graphql.ts:104`

The `github-actions[bot]` user id is documented in `CLAUDE.md` but not at the call site. Future reader of `graphql.ts` sees raw `41898282`. Extract as `const GITHUB_ACTIONS_BOT_USER_ID = 41898282` with a one-line comment.

### P-6 · Standardize pagination idiom across modules

- **Source:** code-comments review (#11, #15)
- **Locations:** `src/graphql.ts:66`, `src/orgExemption.ts:54`, `src/allowlistOrgsAndTeams.ts:146, 190`, `src/pullRerunRunner.ts:54`

Five paginators, three different patterns (`while(true)+break`, `do/while`, `for` with hasNextPage check). Pick one and extract a shared helper or constant set.

### P-7 · Outer-collaborator scope on `@org` lookup

- **Source:** code-comments review (#17)
- **Location:** `src/allowlistOrgsAndTeams.ts` — `fetchOrgMembers` uses `membersWithRole` which excludes outside collaborators.

Document explicitly. A consumer allowlisting `@my-org` might be surprised when an outside-collaborator PR isn't exempted.

### P-8 · `commentContent` mixes mutation and return

- **Source:** code-comments review (#23)
- **Location:** `src/pullrequest/pullRequestComment.ts:101-110`

`prepareCommiterMap` mutates the input and returns it. Classic source of "did the caller pick up the change" bugs. Either return a fresh map or commit to mutation and return void.

### P-9 · Redundant comments in `signatureComment.ts`

- **Source:** code-comments review (#26)
- **Location:** `src/pullrequest/signatureComment.ts:44-46, 49-51, 73`

Three comments restate the code below them. Delete; keep only the BUG-EMAIL-REPLY-REGEX comment.

### P-10 · `signatureComment.ts` uses `.map` for side effects + `var`

- **Source:** code-comments review (#27)
- **Location:** `src/pullrequest/signatureComment.ts:36-43`

Collapse two-pass mutation + `var` into a single `.filter().map(({body, ...rest}) => rest)`.

### P-11 · `@actions/core` brand string leak in startup log

- **Source:** code-comments review (#1)
- **Location:** `src/main.ts:10`

`"CLA Assistant GitHub Action bot has started the process"` — last surviving v2-brand string. Rebrand to "Self-Hosted CLA/DCO Assistant" or genericize.

### P-12 · `interfaces.ts` lacks a file-level header

- **Source:** code-comments review (#34)
- **Location:** `src/interfaces.ts` (file-level)

One paragraph of orientation: "data shapes shared across the committer-resolution → signature-detection → persistence pipeline."

### P-13 · `getInputs.ts` lacks orientation on string-not-boolean convention

- **Source:** code-comments review (#35)
- **Location:** `src/shared/getInputs.ts` (file-level)

One paragraph: "All inputs return `string` because GitHub Actions inputs are not typed; callers compare against `'true'`/`'false'` literals."

### P-14 · `getSelfWorkflowId` pagination off-by-one (wasted API call)

- **Source:** bugs review (#12)
- **Location:** `src/pullRerunRunner.ts:54-78`

Pagination over `total_count`: when count is exactly a multiple of `perPage`, an extra empty page is fetched. Switch to `workflows.length < perPage` as the stop condition.

### P-15 · Orphan demo gifs still hosted on upstream

- **Source:** docs review (#24)
- **Location:** `README.md:91, 105, 120, 149`

Demo images hot-linked from `cla-assistant/github-action`. If upstream rewrites history or rebrands, they break. Mirror into `docs/images/` or accept the risk explicitly.

### P-16 · CONTRIBUTING.md scope/roadmap missing

- **Source:** docs review (#22)
- **Location:** `CONTRIBUTING.md` "Contribute Code" section.

"PRs welcome" without saying what's in/out of scope. CHANGELOG lists three deferred v3.1.x features; CONTRIBUTING should link them as available pickup, and explicitly say what's out of scope (hosted-service / web-UI features).

### P-17 · Test-claim inconsistency between CONTRIBUTING and CLAUDE.md (resolved-but-verify)

- **Source:** docs review (#21)
- **Locations:** CONTRIBUTING.md says "99 tests across `__tests__/`"; CLAUDE.md was updated to remove the "tests are stale" warning. Verify the two are consistent now.

CONTRIBUTING.md line still says 99 — actual count is 124 after the security + feature commits. Bump.

### P-18 · `action.yml` `use-dco-flag` description tone mismatch

- **Source:** docs review (#29)
- **Location:** `action.yml:37`

All other v3 input descriptions are polished; this one reads "Set this to true if you want to use a dco instead of a cla". Tighten to match (e.g. "Set to 'true' to use DCO wording, detection regex, and document-link label instead of CLA. See README §DCO mode for caveats.").

### P-19 · `action.yml` `lock-pullrequest-aftermerge` description has upstream grammar bug

- **Source:** docs review (#30)
- **Location:** `action.yml:39-40`

"Will lock the pull request after merge so that the signature the contributors cannot revoke their signature comments after merge" — clearly garbled. Rewrite cleanly.

### P-20 · App name uniqueness not flagged in setup guide

- **Source:** docs review (#28)
- **Location:** `docs/cla-app-manifest.json:4` + README §6a step 1.

`"name": "Self-Hosted CLA Assistant"` will collide for any consumer trying to create the App. Add a note: "App names are globally unique; prefix with your org or project name."

### P-21 · App manifest `public: false` choice undocumented

- **Source:** docs review (#27)
- **Location:** `docs/cla-app-manifest.json:8`.

Document why this default exists and when consumers would want `true`.

---

## VERIFIED CLEAN — agent flagged, I checked and disagree

For the record so the next review cycle doesn't re-investigate:

### Not a bug · bugs-review #1 (defective optional chain in `setupClaCheck`)

The agent claimed `reactedCommitters?.newSigned.length` would throw when `reactedCommitters` is undefined. **This is wrong.** JavaScript optional chaining short-circuits the **entire** rest of the chain to `undefined`, not just up to the `?.newSigned` node. Verified by re-reading the spec and the code at `src/setupClaCheck.ts:43`. When `prCommentSetup` returns undefined (the no-existing-comment path), the if-clause cleanly evaluates to `undefined` and is treated as falsy. No crash.

### Not a regression · re-confirmed clean from security pass 1

All four prior security fixes (SEC-COMMENT-AUTHOR-FILTER, SEC-PAGINATE-COMMITS, SEC-ESCAPE-AUTHOR-NAME, SEC-STRIP-NEWLINES) verified intact by the security pass-2 agent. No regressions in the new code paths since.

### Not a security issue · supply-chain re-confirmed

`dist/index.js` reproducibility, SHA-pinning, `npm audit --omit=dev = 0` all still hold. The new `@octokit/auth-app@8.2.0` direct dep was confirmed authentic in pass 1; no new direct deps since.

---

## Summary by dimension

| Dimension | Tag-blocker | Should-fix | Polish |
|---|---|---|---|
| Security | 1 (TAG-1) | 2 (SF-19, SF-20) | 0 |
| Bugs / correctness | 0 | 7 (SF-1, SF-2, SF-8, SF-9, SF-10, SF-11, SF-13) | 1 (P-14) |
| Documentation | 0 | 9 (SF-3 through SF-7, SF-14 through SF-18) | 5 (P-15 through P-21) |
| Code comments / maintainability | 0 | 1 (SF-12) | 12 (P-1 through P-13) |
| **Total** | **1** | **19** | **18** |

## Recommended sequencing

1. **Fix TAG-1** before `v3.0.0` tag (paired regression test, single `fix(security):` commit).
2. **v3.0.1 (within a week of v3.0.0):** SF-1, SF-2, SF-9, SF-10 (the bug-blockers that consumers will trip on).
3. **v3.0.2 (within a month):** SF-3 through SF-8, SF-11, SF-13 (docs polish + remaining bugs).
4. **v3.1.0:** SF-14 through SF-21 (feature/doc parity) plus the polish backlog.
5. **v3.2.0 / future:** the remaining P-items as time permits.
