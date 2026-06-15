# Migrating from `contributor-assistant/github-action@v2.x` → `badideasforsale/cla-github-action@v3`

This document covers exactly what to change in your repo when moving from upstream v2.6.1 (or any earlier v2) to this fork's v3.0.0.

**Short version:** swap the `uses:` reference. Most consumers don't need to change anything else.

```diff
- uses: contributor-assistant/github-action@v2.6.1
+ uses: badideasforsale/cla-github-action@v3
```

For full upgrade notes including behavior changes you may notice, read on.

---

## Step 1 — Verify your workflow still works as-is

After the `uses:` swap, your existing workflow continues to function on v3 with no other yaml changes. **You don't need to do anything in this section unless you specifically want one of the v3-only features below.**

What works unchanged:
- `GITHUB_TOKEN` authentication (default — no setup needed)
- `PERSONAL_ACCESS_TOKEN` for cross-repo signatures storage
- All existing input names (no renames)
- Your existing `cla.json` / `signatures/version1/cla.json` file
- The "I have read the CLA Document and I hereby sign the CLA" sign phrase
- Your custom `custom-notsigned-prcomment`, `custom-pr-sign-comment`, etc.
- `pull_request_target` + `issue_comment` workflow triggers
- The bot PR comment lookup — v2-era comments are still recognized and updated in place, no orphans

## Step 2 — What you'll notice (visible behavior changes)

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

## Step 3 — One input was removed

`signed-empty-commit-message` was declared in v2's `action.yml` but never read by any code. If you happened to set it in your workflow, **delete the line**. Behavior is unchanged.

```diff
        with:
          path-to-document: 'https://...'
-         signed-empty-commit-message: 'whatever'
```

## Step 4 — Runtime requirement

The action now runs on **Node 24** (`action.yml`: `using: node24`). Standard GitHub-hosted runners have Node 24 since late 2025. **Self-hosted runners on Node 20 or earlier will fail at action start** with a "not supported" message; bump your runner's Node version.

## Step 5 — Opt into v3 features (all optional)

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

## Step 6 — Workflow YAML hardening (recommended)

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

## Step 7 — Things that look like breaking changes but aren't

These were considered for v3 and rejected to keep your workflows stable:

- **`branch` input default stays `master`.** Many consumers explicitly set this anyway; changing the default would silently break the rest.
- **`lock-pullrequest-aftermerge` default stays `true`.** Lock-on-merge is a security feature; switching to `false` would silently downgrade behavior.
- **`allowlist` not renamed to `allowlist-users`.** Yaml churn for every consumer, marginal disambiguation value.

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
