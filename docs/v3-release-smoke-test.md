# v3 release smoke test

A sequenced plan for validating `badideasforsale/cla-github-action@v3` (a maintained fork of the archived [`contributor-assistant/github-action`](https://github.com/contributor-assistant/github-action)) before pushing the `v3.0.0` tag.

The fork's v3 cut bundles ~25 bug fixes, refactors, and new features. The unit tests cover ~99 cases of pure logic, but a handful of behaviors only show up against real GitHub APIs: the auto-create-signatures-file 404 path, the bot's PR-comment lifecycle, the lock-on-merge flow, and the App-auth token mint. This plan exercises those.

Total time: ~30–45 minutes for the full plan; ~5 minutes for the minimum-viable run.

---

## Step 0 — Prerequisites

- A **commit SHA** from the fork's `main` branch to pin against. The maintainer will give you one — don't pin to `@v3` since that floating tag won't exist until the release tag is pushed.
- A **sacrificial private GitHub repo** for testing. The action commits a signatures file and locks merged PRs; you don't want this against anything real.
- A **second GitHub account**, or willingness to author commits with `git -c user.email=...` to simulate an unsigned contributor.
- (Optional, for the App-auth test in Tier 2) A few minutes to create a GitHub App per `docs/cla-app-manifest.json`.

---

## Step 1 — Set up the sacrificial test repo (~5 min)

1. Create a new **private** repo. Suggested name: `cla-action-smoke`.
2. Add the second account as a collaborator (they need write access to push the unsigned-author PR).
3. **Settings → Actions → General → Workflow permissions:** "Read and write permissions."
4. Add `.github/workflows/cla.yml`. Use the example from the fork's `README.md` (the "Configure Contributor License Agreement within two minutes" section), then change the `uses:` line:

   ```yaml
   uses: badideasforsale/cla-github-action@<the-SHA-from-Step-0>
   ```

5. Point `path-to-document:` at any public URL you control (a README file in another repo works).
6. Leave `branch:` as `main` and **do not** enable branch protection on this test repo's `main` — the action needs to commit the signatures file there.

Commit and push the workflow to `main`. No PR yet.

---

## Step 2 — Tier 1: must-pass smoke (~10 min)

These are the behaviors that v3 specifically claims to fix. If any fail, **do not tag the release** — investigate and re-run.

### 2a — Auto-create the signatures file on first run

Pre-v3 this path was broken (string-vs-number compare on a 404 from the GitHub Contents API). Every consumer had to hand-create `cla.json` to get past a cryptic error.

- The test repo has no `signatures/version1/cla.json` to start (verify before continuing).
- From your **second account**, open a PR adding any small file.

**Pass:** the bot auto-creates `signatures/version1/cla.json` on `main` and posts a "please sign" comment listing the unsigned author in the ✗ list.
**Fail:** the action errors with anything like "Could not retrieve repository contents."

### 2b — Markdown link rendering

The pre-v3 bot rendered signed-committer entries as `(name)[url]` (invalid Markdown — shows as literal text in most clients). v3 emits proper `[name](url)`.

This is observable only after at least one signature lands, so it pairs with 2d below. View the bot's PR comment **rendered** (not via "View source"), and confirm the ✓ entry for the signer is a clickable link.

### 2c — Ghost author should not get `@`-pinged

Pre-v3 would emit `@<raw-git-author-name>` for committers it couldn't resolve to a GitHub user. That sometimes pinged unrelated GitHub users who happened to have a matching login.

On the PR branch, append a commit with a deliberately unclaimable email:

```bash
git -c user.email=ghost-user-9999@example.invalid \
    -c user.name="Ghost McGhostface" \
    commit --allow-empty -m "ghost"
git push
```

**Pass:** the bot's updated ✗ list shows `Ghost McGhostface` with **no `@`-prefix**, and a separate "seems not to be a GitHub user" line below. No notifications fire on unrelated users.
**Fail:** an `@`-prefix appears, or anyone gets a stray notification.

### 2d — Sign comment + in-place comment update

From the unsigned (second) account, post a comment with this exact text:

```
I have read the CLA Document and I hereby sign the CLA
```

**Pass:** the bot **edits its existing comment** to flip that author to ✓; the signatures file gains a new entry via a separate commit; no duplicate "please sign" comment appears.
**Fail:** a second bot comment appears, or the existing one stops updating.

This is also where 2b becomes verifiable — the ✓ line should be a real Markdown link.

### 2e — All-signed → merge → lock

Remove the ghost commit (or add a real second author and have them sign too) so the PR has only signed authors. Merge.

**Pass:** after merge, the PR conversation is **locked** — you can't post a new comment. This proves the lock-after-merge flow still works after the v3 octokit-API ripple.
**Fail:** you can post a new comment, or the workflow errors on merge.

---

## Step 3 — Tier 2: spot checks (pick at least 2; ~10 min)

Each exercises a v3-specific feature. Pick based on which ones your deployment relies on.

### 3a — DCO mode

Skip unless you publish DCO support to your users.

- Add a second workflow file with `use-dco-flag: 'true'` and `path-to-signatures: 'signatures/version1/dco.json'`.
- New PR. Sign phrase becomes "I have read the DCO Document and I hereby sign the DCO".

**Pass:** bot uses DCO wording throughout; footer reads "Self-Hosted DCO Assistant bot"; signatures go to the DCO file.

Also read `README.md`'s "## DCO mode" section before relying on this — there are caveats about strict-DCO compliance (no `Signed-off-by:` trailer enforcement).

### 3b — Allowlist case-insensitivity and wildcard anchoring

Set in the workflow:

```yaml
allowlist: Copilot,bot*
```

Open PRs with commits authored by:
- `copilot@example.com` — **should** be exempted (case-insensitive match against `Copilot`).
- `xbotx@example.com` — **should NOT** be exempted (`bot*` is anchored — "starts with bot", not "contains bot").

Pre-v3 was both case-sensitive and unanchored, so neither expectation held.

### 3c — `bot-name` + `bot-email` override

Add to the workflow:

```yaml
bot-name: 'cla-bot'
bot-email: 'cla-bot@example.com'
```

Trigger a sign that produces a signatures-file commit. View the commit on `main`.

**Pass:** the commit author shows as `cla-bot <cla-bot@example.com>`, not the token's default identity.

Then set **only one** of the two inputs (delete the other) and trigger another sign. The workflow run log should warn that both are required and fall back to the token identity.

### 3d — GitHub App auth

The headline v3 feature. ~10 min one-time setup.

- Create a GitHub App per `docs/cla-app-manifest.json` (use the permissions checklist in that file).
- Install it on the test repo.
- Add `github-app-id: <numeric-id>` to the workflow `with:` block.
- Add `GITHUB_APP_PRIVATE_KEY` to repo secrets (paste the `.pem` contents).

Run a sign cycle.

**Pass:** workflow logs show App authentication; signatures-file commits show as `<your-app-name>[bot] <…@users.noreply.github.com>`.

**Then verify the failure-mode promise:** set `github-app-id` to a bogus value (e.g. `99999999`) without changing the private key. The workflow should:
- Emit a `core.warning` line about App auth failure.
- **Fall back to `GITHUB_TOKEN`** and complete the sign cycle successfully.
- **Never** call `core.setFailed`.

This is critical — App misconfig must not break a workflow that could otherwise succeed.

---

## Step 4 — Decision gate

- **All Tier 1 passes + at least one Tier 2 passes →** proceed to Step 5.
- **Any Tier 1 fails →** stop, file the bug, fix in the source repo, push, get the `build` / `CodeQL` workflows green, restart at Step 2 against the new SHA.

Do not tag around a Tier-1 failure.

---

## Step 5 — Tag `v3.0.0`

In the fork repo:

```bash
git pull --ff-only origin main   # paranoia after any auto-commits like contributors-readme self-pushes
git tag -a v3.0.0 -m "v3.0.0 — first release of the maintained fork"
git push origin v3.0.0
```

This triggers `release.yml`. Watch it:

```bash
gh run watch
```

Expected steps: checkout → setup-node → `npm ci` → `npm run build` → **assert `dist/` is fresh** (this is the safety net against tagging a SHA where the build was stale) → `actions/attest-build-provenance` for `dist/index.js` → derive major tag (`v3` from `v3.0.0`) → force-push the floating `v3` tag → `gh release create`.

If any step fails, the `v3.0.0` immutable tag still exists but the floating `v3` does not advance and there is no GitHub Release published. Diagnose, fix, and re-tag with `v3.0.1` — never reuse a published tag.

---

## Step 6 — Post-release verification

Verify the build-provenance attestation:

```bash
gh attestation verify dist/index.js --owner badideasforsale
```

Should print successful Sigstore-backed verification. This is the consumer-visible proof that `dist/index.js` was built from this source tree at the tagged commit.

In a second test repo (or rename the smoke repo and reuse), repin from the SHA to the floating major tag:

```yaml
uses: badideasforsale/cla-github-action@v3
```

Run one more sign-merge cycle to confirm the floating tag points at the right commit.

---

## Minimum-viable smoke (if time is tight, ~5 min)

Run **only 2a → 2d → 2e**. That covers:

- The auto-create-file fix (the headline reason v3 exists, only observable against the real API).
- The Markdown link rendering correction.
- The in-place comment-update behavior.
- The lock-on-merge flow after the v3 API ripple.

You can skip Tier 2 entirely if you trust the unit tests for those features — they have decent coverage (snapshot tests for the comment rendering, mock-based tests for App auth and `bot-name`/`bot-email`, etc.). But **don't skip 2a** — it's the one consumer-visible behavior with no unit-test equivalent because it requires the real GitHub Contents API's 404 response.

---

## What to do if something is weird but not failing

- **Branch protection on the signatures branch** silently blocks commits. If the action errors with "Could not update the JSON file: …", check protection settings before assuming a bug.
- **`pull_request_target` runs against the BASE repo's workflow file.** Edits to `.github/workflows/cla.yml` on a PR branch don't take effect for that PR until merged into base.
- **`GITHUB_TOKEN` always posts comments as `github-actions[bot]`**, regardless of `bot-name`. That input only affects the signatures-file commit identity. Don't expect PR-comment author rebranding.
- **Re-running a workflow run doesn't re-trigger `issue_comment` events.** To retest the sign-comment path, post a new comment — re-running won't replay the previous one.
- **A leftover `cla.json` containing your test signer will make subsequent PRs from the same author auto-pass.** Either delete the file between runs or test with a fresh author.
