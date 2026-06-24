# Migrating from `contributor-assistant/github-action@v2.x` → `badideasforsale/cla-github-action@v3`

This document covers exactly what to change in your repo when moving from upstream v2.6.1 (or any earlier v2) to this fork's v3.0.0.

**Short version:** swap the `uses:` reference, then **read Step 1 below** — two input defaults changed and either may silently break your workflow if you depended on the v2 values.

```diff
- uses: contributor-assistant/github-action@v2.6.1
+ uses: badideasforsale/cla-github-action@v3
```

For full upgrade notes including behavior changes you may notice, read on.

---

## ⚠️ Step 1 — Check for breaking default changes

Two `action.yml` defaults changed in v3.0.0. **If you previously omitted these inputs and relied on the v2 defaults, your workflow will silently break in one of two ways: writing to a branch that doesn't exist, or treating your existing signatures file as missing and trying to create a duplicate at a different path.**

The fix is one line per input: either move/rename the existing file/branch to the new default, or set the input explicitly in your workflow yaml.

### 1a. `branch` default: `master` → `main`

v2 wrote signatures to a `master` branch by default. v3 writes to `main`, matching GitHub's own new-repo default since 2020.

- **Your signatures branch is `main` already (or you set `branch:` explicitly):** no action needed.
- **Your signatures branch is `master` and you never set the input:** add the input back explicitly so the action keeps writing there.

  ```diff
          with:
            path-to-document: 'https://...'
  +         branch: 'master'
  ```

### 1b. `path-to-signatures` default: `./signatures/cla.json` → `signatures/version1/cla.json`

The README example workflow has always used `signatures/version1/cla.json`; the v2 `action.yml` default never matched the example. v3 aligns them. If you set `path-to-signatures` explicitly in your workflow yaml (most consumers do), nothing changes for you. If you relied on the v2 default, your existing signatures file is at `./signatures/cla.json` — pick **one** option:

- **Option A (preserve your file's location):** keep using the old path by setting the input explicitly.

  ```diff
          with:
            path-to-document: 'https://...'
  +         path-to-signatures: './signatures/cla.json'
  ```

- **Option B (adopt the new convention):** move the file once and don't set the input.

  ```sh
  git mv signatures/cla.json signatures/version1/cla.json
  git commit -m "align signatures file path with v3 default"
  ```

**Do not skip this step.** Without one of the above actions, the action will treat your PR as a first-time install, attempt to create a new file at `signatures/version1/cla.json`, and orphan your existing `./signatures/cla.json`.

### 1c. `lock-pullrequest-aftermerge` now actually requires merge

Pre-v3 the input was named `lock-pullrequest-aftermerge` but the code triggered the lock on **any** `closed` action — including a contributor closing their own unmerged PR. A contributor doing that under v2 would find themselves unable to reopen or comment on their own PR.

v3 matches the behavior to the input name: the lock fires only when the PR was actually merged (`payload.pull_request.merged === true`). Closed-without-merge PRs are left unlocked, so the contributor can reopen and iterate. No yaml change needed.

If your team specifically relied on the v2 lock-on-any-close behavior, file an issue describing the use case — we don't know of any but want to hear about it before re-adding it under a different input name.

---

## Step 2 — Verify your workflow still works as-is (after Step 1)

Once Step 1's defaults are resolved, your existing workflow continues to function on v3 with no other yaml changes. **You don't need to do anything else in this document unless you specifically want one of the v3-only features below.**

What works unchanged:
- `GITHUB_TOKEN` authentication (default — no setup needed)
- `PERSONAL_ACCESS_TOKEN` for cross-repo signatures storage
- All existing input names (no renames)
- Your existing signatures file's *contents* (no schema changes; only the default path moved)
- The "I have read the CLA Document and I hereby sign the CLA" sign phrase
- Your custom `custom-notsigned-prcomment`, `custom-pr-sign-comment`, etc.
- `pull_request_target` + `issue_comment` workflow triggers
- The bot PR comment lookup — v2-era comments are still recognized and updated in place, no orphans

## Step 3 — What you'll notice (visible behavior changes)

These changes happen automatically and are mostly bug fixes:

| Change | Where you'll see it | Source |
|---|---|---|
| Bot footer reads "Self-Hosted CLA Assistant bot" instead of "CLA Assistant Lite bot" | Every PR comment the bot posts after upgrade | M7.1 rebrand |
| Signed-committer links render as proper Markdown | The `:white_check_mark:` lines in multi-committer PR comments | [upstream #67](https://github.com/contributor-assistant/github-action/issues/67) |
| Unmatched commit authors no longer get random `@`-mentions | The `:x:` list in PR comments | [upstream #177](https://github.com/contributor-assistant/github-action/issues/177) |
| Auto-create signatures file works on first install | The very first PR after adding the action to a new repo | [upstream #155](https://github.com/contributor-assistant/github-action/issues/155) |
| Allowlist matching is case-insensitive and wildcards are anchored | `Copilot` matches `copilot`; `foo*` matches `foobar` but no longer matches `xfoobar` | [upstream #169](https://github.com/contributor-assistant/github-action/issues/169) |
| Hidden HTML comment marker appended to bot comments | Source view of the PR comment; invisible in rendered Markdown | M3.5 |
| Email-reply sign phrases are now detected | Contributors replying to GitHub email notifications | [upstream #19](https://github.com/contributor-assistant/github-action/issues/19) |
| `core.info` logs every unsigned committer's name + email | The action's run output | [upstream #92](https://github.com/contributor-assistant/github-action/issues/92) |

### Security fixes you'll inherit

v3.0.0 ships with five security fixes for issues in upstream v2.x. Most are not exploitable without specific consumer-side context (e.g. lots of commits on a single PR, a contributor crafting their git author header), but the SEC-DEDUP-NAME-COLLISION + SEC-PAGINATE-COMMITS pair turn into CLA-gate bypasses if the right conditions are met. Full per-finding writeups are in [`CHANGELOG.md`](./CHANGELOG.md) § Security; one-line summary here so a security reviewer scanning the upgrade can see the surface:

| Finding | Severity | What was broken |
|---|---|---|
| SEC-COMMENT-AUTHOR-FILTER | Medium | A PR opener could DoS the action by spoofing the bot's marker/brand string in a PR comment, causing the bot to fail updateComment and setFailed permanently. |
| SEC-PAGINATE-COMMITS | Medium | The GraphQL committers query stopped after the first 100 commits, letting an attacker bypass the CLA check by padding past position 100. |
| SEC-DEDUP-NAME-COLLISION | Medium | Dedup-by-name conflated resolved GitHub logins with raw git author names — `git commit --author "<signed-login> <attacker@…>"` silently dropped unsigned commits from the check. |
| SEC-ESCAPE-AUTHOR-NAME | Low–Medium | Contributor-controlled git author names rendered raw into the bot's PR comment Markdown; tracking-pixel / phishing-link injection. |
| SEC-STRIP-NEWLINES | Low | `\n` in a git author header could spawn workflow-command annotations (`::warning::`, `::error::`, `::add-mask::`) on the next runner-parsed log line. |

## Step 4 — One input was removed

`signed-empty-commit-message` was declared in v2's `action.yml` but never read by any code. If you happened to set it in your workflow, **delete the line**. Behavior is unchanged.

```diff
        with:
          path-to-document: 'https://...'
-         signed-empty-commit-message: 'whatever'
```

## Step 5 — Runtime requirement

The action now runs on **Node 24** (`action.yml`: `using: node24`). Standard GitHub-hosted runners have Node 24 since late 2025. **Self-hosted runners on Node 20 or earlier will fail at action start** with a "not supported" message; bump your runner's Node version.

## Step 6 — Opt into v3 features (all optional)

### `github-app-id` + `GITHUB_APP_PRIVATE_KEY` — GitHub App auth (recommended over PAT)

If you currently use `PERSONAL_ACCESS_TOKEN` for cross-repo signatures storage, consider migrating to a GitHub App. App auth gives you:

- Bot identity instead of a human-tied token (no "the action broke because Alice left the company" failure mode)
- Short-lived installation tokens (1 hour) instead of long-lived PATs
- Clean audit trail (commits show as `<your-app>[bot]`)
- Works for cross-org storage if installed in both orgs

Setup is a 5-minute one-time effort. See README §6a for the walkthrough.

You can run both auth modes side-by-side during migration: leave `PERSONAL_ACCESS_TOKEN` configured AND add `github-app-id` — App wins automatically.

### `exempt-repo-org-members: 'true'` — auto-allowlist members of your org

If your contributors are mostly internal, this drops them from the CLA check without listing every name in `allowlist`. Needs `read:org` scope (the default `GITHUB_TOKEN` covers public-org members; private orgs need a PAT or App with the scope).

### `pull-request-number` — drive the action from `workflow_run` triggers

Workflows triggered by `workflow_run` (e.g. when the CLA check should fire AFTER another workflow completes) don't carry a PR number in the payload. Set `pull-request-number: <from-your-trigger>` to override `context.issue.number`.

### `bot-name` + `bot-email` — override the commit identity

By default signature commits show under the token's identity. To override:

```yml
        with:
          bot-name: 'cla-bot'
          bot-email: 'cla-bot@example.com'
```

Must be set together (setting only one warns and falls back).

## Step 7 — Workflow YAML hardening (recommended)

These aren't required — your existing workflow continues to work — but the README v3 example uses safer patterns:

```diff
 jobs:
   CLAAssistant:
     runs-on: ubuntu-latest
+    # M4.6: only fire on issue_comment when it's on a pull request, not a plain issue.
+    if: (github.event_name == 'pull_request_target') || (github.event_name == 'issue_comment' && github.event.issue.pull_request)
     steps:
       - name: "CLA Assistant"
-        if: (github.event.comment.body == 'recheck' || github.event.comment.body == 'I have read the CLA Document and I hereby sign the CLA') || github.event_name == 'pull_request_target'
+        # M4.4: contains() is forgiving about whitespace, emoji, and quoted email replies.
+        if: |
+          github.event_name == 'pull_request_target' ||
+          github.event.comment.body == 'recheck' ||
+          contains(github.event.comment.body, 'I have read the CLA Document and I hereby sign the CLA')
```

And the security callout (M4.8) — **do not** combine this workflow with `actions/checkout` of the PR head ref. See README banner for details.

## Step 8 — Things that look like breaking changes but aren't

These were considered for v3 and rejected to keep your workflows stable:

- **`lock-pullrequest-aftermerge` default stays `true`.** Lock-on-merge is a security feature; switching to `false` would silently downgrade behavior.
- **`allowlist` not renamed to `allowlist-users`.** Yaml churn for every consumer, marginal disambiguation value.

(Two other defaults DID change in v3.0.0 — `branch` and `path-to-signatures` — see Step 1 above.)

## Troubleshooting

Most issues fall into a small number of buckets — see the [Troubleshooting section](./README.md#troubleshooting--setup-gotchas) in the main README. Quick links:

- "Could not update the JSON file" — protected branch
- PAT classic vs fine-grained
- Org-owned PAT 500 errors
- Workflow doesn't fire on issue comments

For anything else, [open an issue](https://github.com/badideasforsale/cla-github-action/issues/new).

## Reverting

If v3 breaks something for you, revert the `uses:` reference and pin a SHA so you don't drift:

```yml
        uses: contributor-assistant/github-action@v2.6.1
```

Please also [file an issue](https://github.com/badideasforsale/cla-github-action/issues/new) explaining what broke — that's the signal we need to fix it.
