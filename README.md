# Self-Hosted CLA Assistant

Handle Contributor License Agreement (CLA) or Developer Certificate of Origin (DCO) signatures via GitHub Actions — decentralized, no third-party service. Contributors sign by posting a PR comment; signatures are stored as JSON in a repo of your choice (same repo, or remote).

> [!NOTE]
> **This is a maintained fork** of [contributor-assistant/github-action](https://github.com/contributor-assistant/github-action) (archived 2026), itself a continuation of [cla-assistant/github-action](https://github.com/cla-assistant/github-action). Originally created by [@ibakshay](https://github.com/ibakshay) and the [cla-assistant](https://github.com/cla-assistant) maintainers — many thanks to them for the years of work that made this possible. This fork picks up where upstream left off; see [`CHANGELOG.md`](./CHANGELOG.md) for v3 changes.
>
> Consumers on `contributor-assistant/github-action@v2.x` can switch the tag to this fork's `@v3` — see [`MIGRATION.md`](./MIGRATION.md) for the upgrade walkthrough.

> [!TIP]
> **Using DCO instead of CLA?** Set `use-dco-flag: 'true'`. Bot wording and the sign-phrase regex auto-flip to DCO equivalents. The signed-comment regex tolerates "I have read the DCO Document and I hereby sign the DCO". For brevity the rest of this README uses CLA terminology; substitute "DCO" mentally where you see "CLA". **Note:** the default `signed-commit-message` and `create-file-commit-message` templates still contain the literal string "CLA" — override both inputs explicitly if you want "DCO" in your git history. **Before turning DCO mode on, read [DCO mode caveats](#dco-mode) below — it has important limitations.**

### Features
1. decentralized data storage
1. fully integrated within github environment
1. no User Interface is required
1. contributors can sign the CLA or DCO by just posting a Pull Request comment
1. signatures will be stored in a file inside the repository or in a remote repository
1. signatures can also be stored inside a private repository
1. versioning of signatures

## Configure Contributor License Agreement within two minutes

> [!IMPORTANT]
> **Before step 1 — workflow permissions.** Go to **Settings → Actions → General → Workflow permissions** on your repo (or org settings) and confirm "Read and write permissions" is selected. If this is set to "Read repository contents and packages permissions" (the GitHub default for new orgs), the action's `permissions:` block alone cannot grant write — every comment-post + signature-commit will fail with an opaque HTTP 403, and the action will not surface the cause. This single setting is the most common first-install failure mode.

#### 1. Add the following Workflow File to your repository in this path`.github/workflows/cla.yml`

```yml
name: "CLA Assistant"
on:
  issue_comment:
    types: [created]
  pull_request_target:
    types: [opened,closed,synchronize]

# explicitly configure permissions, in case your GITHUB_TOKEN workflow permissions are set to read-only in repository settings
permissions:
  actions: write
  contents: write # this can be 'read' if the signatures are in remote repository
  pull-requests: write
  statuses: write

jobs:
  CLAAssistant:
    runs-on: ubuntu-latest
    # Skip plain-issue comments — fire only on pull-request comments and pull_request_target.
    if: (github.event_name == 'pull_request_target') || (github.event_name == 'issue_comment' && github.event.issue.pull_request)
    steps:
      - name: "CLA Assistant"
        # `contains()` is forgiving about trailing whitespace, line breaks, and quoted email replies — the action's own regex does the precise matching.
        if: |
          github.event_name == 'pull_request_target' ||
          github.event.comment.body == 'recheck' ||
          contains(github.event.comment.body, 'I have read the CLA Document and I hereby sign the CLA')
        uses: badideasforsale/cla-github-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # the below token should have repo scope and must be manually added by you in the repository's secret
          # This token is required only if you have configured to store the signatures in a remote repository/organization
          # PERSONAL_ACCESS_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        with:
          path-to-signatures: 'signatures/version1/cla.json'
          path-to-document: 'https://github.com/cla-assistant/github-action/blob/master/SAPCLA.md' # e.g. a CLA or a DCO document
          # branch should not be protected
          branch: 'main'
          allowlist: 'user1,bot*,@your-org,@your-org/your-team'

         # the followings are the optional inputs - If the optional inputs are not given, then default values will be taken
          #remote-organization-name: enter the remote organization name where the signatures should be stored (Default is storing the signatures in the same repository)
          #remote-repository-name: enter the  remote repository name where the signatures should be stored (Default is storing the signatures in the same repository)
          #create-file-commit-message: 'For example: Creating file for storing CLA Signatures'
          #signed-commit-message: 'For example: $contributorName has signed the CLA in $owner/$repo#$pullRequestNo'
          #custom-notsigned-prcomment: 'pull request comment with Introductory message to ask new contributors to sign'
          #custom-pr-sign-comment: 'The signature to be committed in order to sign the CLA'
          #custom-allsigned-prcomment: 'pull request comment when all contributors have signed; defaults to "All contributors have signed the CLA  ✍️ ✅".'
          #lock-pullrequest-aftermerge: false - if you don't want this bot to automatically lock the pull request after merging (default - true)
          #use-dco-flag: true - If you are using DCO instead of CLA
          #exempt-repo-org-members: true - if true, members of the repo's owning org are auto-allowlisted (requires read:org-scoped PAT for private orgs)

```

> [!WARNING]
> **Security hardening — read this before adding more steps to the CLA workflow.**
>
> This action uses [`pull_request_target`](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#pull_request_target) so it can write signatures and post comments on PRs opened from forks. Workflows triggered by `pull_request_target` run in the base repository's context **with access to secrets**.
>
> **Do not add `actions/checkout` against the PR head ref (`${{ github.event.pull_request.head.sha }}` or `${{ github.event.pull_request.head.ref }}`) in this workflow.** Combining `pull_request_target` with checking out untrusted fork code lets the fork author execute arbitrary code with your repository secrets — the canonical "pwn request" attack. See GitHub Security Lab's [Preventing pwn requests](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/).
>
> This action itself never checks out fork code; it operates on PR metadata and comments via the API. The warning is for any other steps you might add to the same workflow file.

##### Demo for step 1

![add-cla-file](https://github.com/cla-assistant/github-action/blob/master/images/adding-clafile.gif?raw=true)

#### 2. Pull Request event triggers CLA Workflow

CLA action workflow will be triggered on all Pull Request `opened, synchronize, closed`. This workflow will always run in the base repository and that's why we are making use of the [pull_request_target](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#pull_request_target) event.
<br/> When the CLA workflow is triggered on pull request `closed` event, it will lock the Pull Request conversation after the Pull Request merge so that the contributors cannot modify or delete the signatures (Pull Request comment) later. This feature is optional.

#### 3. Signing the CLA

CLA workflow creates a comment on Pull Request asking contributors who have not signed  CLA to sign and also fails the pull request status check with a `failure`. The contributors are requested to sign the CLA within the pull request by copy and pasting **"I have read the CLA Document and I hereby sign the CLA"** as a Pull Request comment like below.
If the contributor has already signed the CLA, then the PR status will pass with `success`. <br/>

##### Demo for step 2 and 3

![signature-process](https://github.com/cla-assistant/github-action/blob/master/images/signature-process.gif?raw=true)

<br/>

#### 4. Signatures stored in a JSON file

After the contributor signed a CLA, the contributor's signature with metadata will be stored in a JSON file inside the repository and you can specify the custom path to this file with `path-to-signatures` input in the workflow. <br/> The default path is `path-to-signatures: 'signatures/version1/cla.json'`.

The signature can be also stored in a remote repository which can be done by enabling the optional inputs `remote-organization-name`: `<your org name>`
and `remote-repository-name`: `<your repo name>` in your CLA workflow file.

**NOTE:** You do not need to create this file manually. Our workflow will create the signature file if it does not already exist. Manually creating this file will cause the workflow to fail.

##### Demo for step 4

![signature-storage-file](https://github.com/cla-assistant/github-action/blob/master/images/signature-storage-file.gif?raw=true)

#### 5. Users, bots, orgs, and teams in allowlist

Add anyone you don't want to require a CLA from to the `allowlist` input — comma-separated. Four entry shapes are supported:

| Shape | Example | Matches |
|---|---|---|
| Plain login | `dependabot[bot]` | exact GitHub login (case-insensitive) |
| Wildcard | `bot*` | any login starting with `bot` (anchored — `xbotx` does NOT match) |
| `@org` | `@temporal-io` | every member of that GitHub org |
| `@org/team` | `@acme/security` | every member of that team, including child teams |

The org/team forms are useful when an organization has signed a corporate CLA on behalf of all its engineers — you don't have to maintain a per-user list. Membership is resolved live via GraphQL at action runtime; people who join the org later are picked up automatically on the next PR they open. Combinable in one input:

```yml
allowlist: 'dependabot[bot],*[bot],@temporal-io,@acme/security'
```

> [!IMPORTANT]
> **Auth requirements for `@org` / `@org/team`:**
> - **Public orgs** are visible to the default `GITHUB_TOKEN` — no setup needed.
> - **Private orgs** need `read:org` scope. Use a PAT (`PERSONAL_ACCESS_TOKEN`) or a GitHub App installed in that org.
> - **Team lookups always require `read:org`** — teams are private by default, even inside public orgs.
>
> Per-entry failure is soft: if `@some-org` can't be resolved (private org without scope, network blip, typo), the action logs a warning and continues. The CLA check is never blocked by an allowlist-expansion failure — committers in that unresolved entry simply fall through to the normal CLA flow.

##### Demo for step 5

![allowlist](https://github.com/cla-assistant/github-action/blob/master/images/allowlist.gif?raw=true)

#### 6. Authentication

The action needs a token to read PR data, post comments, and write the signatures file. There are three options, listed best-to-worst.

##### 6a. GitHub App (recommended)

A dedicated GitHub App with bot identity, short-lived 1-hour tokens, no human ownership. Best for production, best for org-wide rollouts, best for cross-repo signatures storage. Two inputs + one env var:

> [!NOTE]
> **Naming the App.** GitHub App names are globally unique across all of github.com. The reference manifest at `docs/cla-app-manifest.json` declares `"name": "Self-Hosted CLA Assistant"`, which is already taken or will be taken soon. Prefix with your org or project — e.g. `acme-cla-bot` — when filling in the App creation form.
>
> **Public vs private.** The reference manifest sets `"public": false`, meaning your App can only be installed in your own org/account. If you want to allow other orgs (e.g. for a public open-source project where contributors install the App in their own forks for cross-repo storage), switch to `"public": true` before creating the App. The bool can't be changed via the UI after creation — only programmatically via the App's settings API.

```yml
        with:
          github-app-id: ${{ secrets.CLA_APP_ID }}
          # Optional: skip the auto-discovery API call by pinning the installation id.
          # github-app-installation-id: '12345678'
        env:
          GITHUB_APP_PRIVATE_KEY: ${{ secrets.CLA_APP_PRIVATE_KEY }}
```

**One-time setup** (manual; an `npx` bootstrap script is planned for v3.1.x):

1. Go to `https://github.com/settings/apps/new` (personal-owned) or `https://github.com/organizations/<your-org>/settings/apps/new` (org-owned — recommended for production).
2. Use [`docs/cla-app-manifest.json`](./docs/cla-app-manifest.json) as the reference for which permissions and events to set. The relevant fields:
   - **Repository permissions:** Actions: write, Contents: write, Issues: write, Pull requests: read
   - **Organization permissions** (only if you'll use `exempt-repo-org-members: true`): Members: read
   - **Subscribe to events:** Pull request, Issue comment
   - **Webhook:** uncheck "Active" — this action never receives webhooks
3. Create the App, then on the App's page click "Generate a private key" — a `.pem` file downloads.
4. Click "Install App" and pick the repo(s) you want it to cover. For cross-repo signatures storage, install on both the PR repo AND the signatures repo. If signatures are in a different org, the App must be installed in both orgs and you must set `github-app-installation-id` explicitly to the PR-repo's installation id (auto-discovery only looks up the workflow's repo).
5. In your repo's Settings → Secrets and variables → Actions, add:
   - `CLA_APP_ID` — the App's numeric ID (visible at the top of the App's settings page)
   - `CLA_APP_PRIVATE_KEY` — the entire PEM contents, including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines.
6. Wire the workflow yaml as shown above.

If the App-auth lookup fails for any reason (App not installed on this repo, invalid private key, network blip), the action emits a `core.warning` and falls back to `GITHUB_TOKEN` — the failure never breaks a workflow that could otherwise succeed.

##### 6b. `GITHUB_TOKEN` (default)

No setup. The action uses the runner's auto-provisioned token for everything. **Limitation:** `GITHUB_TOKEN` is scoped to the current repo, so it cannot write signatures to a different repo — if you want cross-repo storage, you need 6a or 6c.

##### 6c. Personal Access Token (legacy)

Human-tied secret. **Discouraged** for new setups — use 6a instead — but still supported for backward compatibility and as a fallback when an App isn't an option. Required only when signatures are stored in a remote repository/organization without using App auth.

Create a [Personal Access Token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) with `repo` scope (and `read:org` if using `exempt-repo-org-members`), then add it as `PERSONAL_ACCESS_TOKEN` in your repo's secrets.

Trade-offs: PAT is tied to the human who creates it — if they leave, the action breaks silently. Tokens are long-lived. Commits show under that human's identity, which conflates bot activity with real user activity. App auth (6a) solves all three.

#### 7. Verify the install

After the workflow file lands on your default branch (and you've checked the workflow-permissions setting from the IMPORTANT callout above), test the end-to-end path before relying on it:

1. From a second GitHub account (or a sock-puppet account), open a PR adding any small file.
2. Watch the workflow run. **Expected:** the action posts a "please sign" PR comment listing your unsigned committer in the ✗ list, the status check shows red, and the signatures file is auto-created on your `branch:` if it didn't exist.
3. From the unsigned account, comment exactly: `I have read the CLA Document and I hereby sign the CLA`. (Use `DCO` instead of `CLA` if you've set `use-dco-flag: 'true'`.)
4. **Expected:** the bot edits its existing comment to mark you ✓, the signatures file gets a new entry (visible as a commit on the `branch:`), and the status check flips green.
5. Merge the PR. **Expected:** the conversation locks (you can't post a new comment), preventing post-merge signature edits.

If any step doesn't match the expected behavior, check the workflow run logs and the troubleshooting section before assuming a bug.

### Environmental Variables:


| Name                  | Requirement | Description |
| --------------------- | ----------- | ----------- |
| `GITHUB_TOKEN`        | _required_ (unless using App) | Usage: `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. The runner's auto-provisioned token. Built into GitHub Actions; does not need to be manually created. [More info](https://help.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token). |
| `GITHUB_APP_PRIVATE_KEY` | _required_ for App auth | Usage: `GITHUB_APP_PRIVATE_KEY: ${{ secrets.CLA_APP_PRIVATE_KEY }}`. The PEM contents of the App's private key. Env var rather than action input because PEM blobs are multi-line. |
| `PERSONAL_ACCESS_TOKEN` | _required_ for cross-repo storage without App | Usage: `PERSONAL_ACCESS_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}`. [PAT](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) with `repo` scope (and `read:org` if using `exempt-repo-org-members`). |

### Inputs

Inputs without a default are required. `action.yml` is the source of truth; this table summarizes.

| Name | Default | Description | Example |
| --- | --- | --- | --- |
| `path-to-document` | _(required)_ | Full URL to the CLA/DCO document the contributor must sign. Can be a file in this repo, a gist, or any web URL. | `https://github.com/<owner>/<repo>/blob/main/CLA.md` |
| `path-to-signatures` | `signatures/version1/cla.json` | Path inside the storage repo for the JSON file holding signatures. | `signatures/version1/cla.json` |
| `branch` | `main` | Branch on the storage repo where signatures are committed. Must not be branch-protected. | `main` |
| `use-dco-flag` | `"false"` | Set to `"true"` to use DCO wording and detection regex instead of CLA. | `"true"` |
| `allowlist` | `""` | Comma-separated usernames, wildcard patterns, `@org` (every org member), or `@org/team` (every team member incl. child teams). Case-insensitive. See [Users, bots, orgs, and teams in allowlist](#5-users-bots-orgs-and-teams-in-allowlist). | `'user1,bot*,@acme,@acme/security'` |
| `exempt-repo-org-members` | `"false"` | When `"true"`, members of the repository's owning organization are auto-allowlisted. Requires `read:org` for private orgs. | `"true"` |
| `remote-organization-name` | _(empty)_ | Store signatures in a different org's repo. Requires App auth or PAT to write cross-repo. | `my-org` |
| `remote-repository-name` | _(empty)_ | Pair with `remote-organization-name`. | `cla-signatures` |
| `lock-pullrequest-aftermerge` | `"true"` | Lock the PR's comment thread after merge so contributors can't revoke their signature post-hoc. | `"false"` |
| `suggest-recheck` | `"true"` | Whether the bot comment suggests `recheck` as a re-trigger phrase. | `"false"` |
| `pull-request-number` | _(empty)_ | Override `context.issue.number`. Required for `workflow_run` and other non-PR triggers. | `1234` |
| `custom-notsigned-prcomment` | _(empty — uses default text)_ | Override the bot's "please sign" message. Supports `$you` and `$pathToDocument` substitutions. | `Please sign $pathToDocument` |
| `custom-pr-sign-comment` | _(empty — uses default phrase)_ | Override the exact phrase contributors must post to sign. | `I agree to the CLA` |
| `custom-allsigned-prcomment` | _(empty — uses default text)_ | Override the bot's "all signed" footer message. | `All set, thanks!` |
| `create-file-commit-message` | `Creating file for storing CLA Signatures` | Commit message when the action auto-creates the signatures file on first run. | `chore: init cla.json` |
| `signed-commit-message` | `@$contributorName has signed the CLA in $owner/$repo#$pullRequestNo` | Commit message when a contributor signs. Supports `$contributorName`, `$pullRequestNo`, `$owner`, `$repo` substitutions. | `$contributorName signed PR #$pullRequestNo` |
| `bot-name` | _(empty — uses token identity)_ | Override the author/committer name on signature commits. Must be set together with `bot-email`. | `cla-bot` |
| `bot-email` | _(empty — uses token identity)_ | Override the author/committer email. Pairs with `bot-name`. | `cla-bot@example.com` |
| `github-app-id` | _(empty — uses GITHUB_TOKEN/PAT)_ | Numeric GitHub App ID. Set with `GITHUB_APP_PRIVATE_KEY` env var to authenticate as the App. See §6a. | `123456` |
| `github-app-installation-id` | _(empty — auto-discovers)_ | Pin the installation id explicitly to skip the auto-discovery API call (~200 ms). | `12345678` |

## Examples

The basic workflow above covers the common case. Below are three deployments that need extra inputs — keep them collapsed unless they apply to you.

<details>
<summary><strong>Cross-repo signature storage (PAT auth)</strong> — store all signatures in a different repo than the one the PR is opened against.</summary>

Useful when many repos share a single CLA: keep one canonical signatures file in `<your-org>/cla-signatures` instead of duplicating across every project.

You need a Personal Access Token with `repo` scope on the signatures repo; the default `GITHUB_TOKEN` cannot cross repo boundaries. Add it as a secret on the PR repo.

```yml
name: "CLA Assistant"
on:
  issue_comment:
    types: [created]
  pull_request_target:
    types: [opened, closed, synchronize]

permissions:
  actions: write
  contents: read     # we don't write to THIS repo — signatures live elsewhere
  pull-requests: write
  statuses: write

jobs:
  CLAAssistant:
    runs-on: ubuntu-latest
    if: (github.event_name == 'pull_request_target') || (github.event_name == 'issue_comment' && github.event.issue.pull_request)
    steps:
      - name: "CLA Assistant"
        if: |
          github.event_name == 'pull_request_target' ||
          github.event.comment.body == 'recheck' ||
          contains(github.event.comment.body, 'I have read the CLA Document and I hereby sign the CLA')
        uses: badideasforsale/cla-github-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PERSONAL_ACCESS_TOKEN: ${{ secrets.CLA_PAT }}
        with:
          path-to-document: 'https://github.com/your-org/cla-signatures/blob/main/CLA.md'
          remote-organization-name: 'your-org'
          remote-repository-name: 'cla-signatures'
          path-to-signatures: 'signatures/version1/cla.json'
          branch: 'main'
```

PAT scopes: `repo` (classic) or read+write on `contents` (fine-grained, scoped to the signatures repo only). See README troubleshooting if you hit a 500 error — that's typically the org-owned-PAT issue.

</details>

<details>
<summary><strong>GitHub App authentication</strong> — replace the PAT (or augment <code>GITHUB_TOKEN</code>) with a bot identity that has cleaner audit trails and short-lived tokens.</summary>

Setup (one-time, ~5 min):

1. Create a GitHub App from the reference manifest at [`docs/cla-app-manifest.json`](./docs/cla-app-manifest.json). App names must be globally unique on GitHub — prefix with your org or project name (e.g. `acme-cla-bot`).
2. Install the App on the repo(s) involved. For cross-repo storage, install on both the PR repo and the signatures repo.
3. Save the App's private key (`.pem`) as a repo secret named `CLA_APP_PRIVATE_KEY`. Note the numeric App ID from the App's settings page.

```yml
name: "CLA Assistant"
on:
  issue_comment:
    types: [created]
  pull_request_target:
    types: [opened, closed, synchronize]

permissions:
  actions: write
  contents: write
  pull-requests: write
  statuses: write

jobs:
  CLAAssistant:
    runs-on: ubuntu-latest
    if: (github.event_name == 'pull_request_target') || (github.event_name == 'issue_comment' && github.event.issue.pull_request)
    steps:
      - name: "CLA Assistant"
        if: |
          github.event_name == 'pull_request_target' ||
          github.event.comment.body == 'recheck' ||
          contains(github.event.comment.body, 'I have read the CLA Document and I hereby sign the CLA')
        uses: badideasforsale/cla-github-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_APP_PRIVATE_KEY: ${{ secrets.CLA_APP_PRIVATE_KEY }}
        with:
          path-to-document: 'https://github.com/your-org/repo/blob/main/CLA.md'
          path-to-signatures: 'signatures/version1/cla.json'
          branch: 'main'
          github-app-id: '123456'
          # Optional: pin the installation id to skip ~200ms of auto-discovery per run
          # github-app-installation-id: '78910'
```

The action mints an installation token from the App's private key on each run. On any App misconfig (wrong id, key not loaded, App not installed on this repo), the action emits a `core.warning` and **falls back to `GITHUB_TOKEN`** — your workflow doesn't fail closed on App-auth issues. Look for `Falling back to GITHUB_TOKEN` in the workflow run logs.

</details>

<details>
<summary><strong>Org/team allowlist</strong> — exempt every member of a GitHub org or team from having to sign individually.</summary>

When a corporate CLA covers all engineers in an org, list the org once in `allowlist` instead of every member's login. Membership is resolved at runtime, so contributors who join later are picked up automatically.

```yml
        with:
          path-to-document: 'https://github.com/your-org/repo/blob/main/CLA.md'
          allowlist: 'dependabot[bot],*[bot],@acme-corp,@partner-org/security-team'
```

- **`@acme-corp`** — every member of the `acme-corp` org is auto-allowlisted.
- **`@partner-org/security-team`** — every member of the `security-team` team in `partner-org`, including child-team members (uses GraphQL `membership: ALL`).
- Mix freely with plain logins and wildcards in the same comma-separated string.

**Auth requirements:** public orgs are visible to the default `GITHUB_TOKEN` — no setup needed. Private orgs and **any** team lookup need a token with `read:org` scope — use a PAT (`PERSONAL_ACCESS_TOKEN` env var with `read:org`) or a GitHub App installed in the target org. If the lookup fails for any one entry, the action logs a warning and falls through to the regular CLA check for that entry's would-be members; the gate is never blocked by an allowlist-expansion failure.

See [`README.md` § "Users, bots, orgs, and teams in allowlist"](#5-users-bots-orgs-and-teams-in-allowlist) for full syntax details.

</details>

## DCO mode

Setting `use-dco-flag: 'true'` switches the bot's wording, the sign-phrase regex, and the document-link label from CLA to DCO equivalents. Storage shape, authentication, allowlist, marker-based multi-job lookup, and every other input behave identically — only the user-facing text and the matching pattern change.

> [!IMPORTANT]
> **This is not a strict DCO check, and these notes were not written by a lawyer.**
>
> A canonical [Developer Certificate of Origin](https://developercertificate.org/) implementation enforces a `Signed-off-by: Name <email>` trailer on every commit in the PR — the model the Linux kernel uses, and what tools like [Probot DCO](https://github.com/probot/dco) verify. **This action does not check trailers.** It looks for a PR-comment sign phrase, the same mechanism CLA mode uses, with DCO wording substituted in.
>
> If your project needs trailer-enforced DCO compliance for legal review, this action won't get you there — reach for a trailer-checking tool instead. If you want the DCO's lower-friction model (attest by phrase, no rights granted) as an alternative to a CLA, this works fine.
>
> Adding real `Signed-off-by:` verification would be a welcome contribution — [open a PR](https://github.com/badideasforsale/cla-github-action/compare).

### Pitfall: don't flip `use-dco-flag` on a repo with existing signatures

The bot's existing-comment lookup is brand-specific — it matches the `Self-Hosted CLA Assistant bot` footer in CLA mode and `Self-Hosted DCO Assistant bot` in DCO mode (plus the legacy v2-era brand strings as a fallback). **Flipping the flag mid-stream means the bot can't find its previous comment and posts a new one.** And earlier signers attested to whatever document the flag's *previous* mode named, which may not match what your new mode now prompts new signers with.

There is no in-place migration path. Pick CLA or DCO at install time. If you genuinely need to switch:

1. Move the existing signatures file aside, or point `path-to-signatures:` at a new path so old and new signatures don't intermix.
2. Notify existing signers that they need to re-sign under the new framework.
3. Manually close or annotate the orphaned bot comments on any in-flight PRs so contributors aren't looking at the wrong sign phrase.

## Troubleshooting & setup gotchas

### "Could not update the JSON file" — protected branch

If you've configured branch protection on the branch where signatures are stored (the `branch` input), the action will fail with a message like:

> `Could not update the JSON file: <api error>. Make sure the branch where signatures are stored is NOT protected.`

GitHub's branch protection blocks direct pushes from any actor, including the bot the action authenticates as. Three options:

1. **Use an unprotected branch** for signatures (e.g. a dedicated `cla-signatures` branch separate from `main`). This is the simplest fix and what we recommend.
2. **Bypass branch protection for the App / PAT identity.** In branch protection rules → "Bypass list," add the App or the user who owns the PAT. App auth is cleaner here because the bypass entry is a non-human bot identity.
3. **Store signatures in a separate, unprotected repository** via `remote-organization-name` + `remote-repository-name`.

### PAT: classic vs fine-grained

If you're using PAT auth (§6c), prefer **classic PATs** for this action. Reasons:

- Fine-grained PATs require explicit repo selection at creation time and grant per-repo permissions. They're more secure, but the `apps.getRepoInstallation`-style fallbacks the action uses for cross-repo storage don't always work cleanly with fine-grained scopes. If you've configured cross-repo storage and get opaque 403/404 errors, a fine-grained PAT not covering the storage repo is the most common cause.
- Classic PATs with `repo` scope are simpler and well-tested for this use case.
- For org-exempt-members (`exempt-repo-org-members: true`), add `read:org` to whichever PAT type you use.

If you can pick App auth instead (§6a), do that — it's strictly better than either PAT type.

### Org-owned PAT 500 errors

If a PAT was created by a member of an organization, and that member's privileges change (role downgrade, SSO de-provisioning, account deletion), the API can return opaque `500 Internal Server Error` responses rather than `401`/`403`. If the action suddenly starts failing without a code change, regenerate the PAT under a still-active human's account — or, again, move to App auth.

### Workflow doesn't fire on issue comments

If contributors post the sign comment and nothing happens, three usual suspects:

1. The `if:` gate in your workflow yaml didn't match. The example uses `contains(...)` for forgiveness, but if you tightened it to `==` the comment must match exactly, including trailing whitespace.
2. The PR is closed. The action short-circuits on `issue_comment` events against closed PRs.
3. The contributor's comment is on a plain issue, not a PR comment. The example workflow's `if: github.event.issue.pull_request` guard filters this — make sure you have it.

### Action runs but the "X out of Y signed" comment renders broken

This was a real bug (inverted Markdown link, `(name)[url]` instead of `[name](url)`) fixed in v3. If you're on v2.6.1 or earlier, upgrade.

### The `recheck` PR comment — manually re-trigger the action

If the bot hasn't updated its comment (e.g. you signed but the comment still says ✗), post `recheck` as a PR comment. The example workflow's `if:` block detects this exact string and re-runs the action against the current PR state without needing a new commit or sync.

Useful when:
- A transient API failure left the bot's last update stale.
- You added or removed an allowlist entry on the workflow file (on `main`) and want the open PRs to pick it up without pushing new commits.
- A test repo's signatures file was hand-edited and you want the action to re-check.

`recheck` is just a magic string the example workflow watches for in its `if:` — change it to whatever you like by editing the workflow yaml.

### App-auth — confirming it's actually being used (and debugging when it isn't)

The action falls back to `GITHUB_TOKEN` on any App-auth failure (App not installed on this repo, invalid private key, network blip) and emits a `core.warning`. To check what's happening:

- **In the workflow run logs**, look for lines like:
  - `GitHub App 123456: discovered installation id 789 for owner/repo` → App auth working.
  - `GitHub App 123456 is not installed on owner/repo` → install the App at `https://github.com/apps/<slug>/installations/new`.
  - `GITHUB_APP_PRIVATE_KEY env var is required when not using GitHub App auth` → secret name mismatch in the workflow yaml, or the secret isn't set.
- **In the signatures-file commit history**, the committer identity tells you which auth path won. App-auth commits show as `<your-app-slug>[bot] <…@users.noreply.github.com>`. `GITHUB_TOKEN` commits show as `github-actions[bot]`. PAT commits show under the PAT owner's identity.
- **`gh api /app` from the runner** (if you can SSH or add a debug step) returns App metadata only when authenticated as the App; under `GITHUB_TOKEN` it returns 401.

### Workflow name containing `-->` breaks multi-job comment isolation

The action appends a hidden HTML marker `<!-- cla-lite-bot:<kind>:<workflow>:<job> -->` to every bot comment so multiple CLA/DCO jobs in the same workflow file find their own comment instead of stomping each other. The `<workflow>` and `<job>` slugs come straight from the runner's `GITHUB_WORKFLOW` / `GITHUB_JOB` env vars, which mirror the consumer-chosen `name:` field in the workflow yaml.

**If your workflow `name:` contains the literal sequence `-->`** (e.g. `name: "Build & Test --> Sign CLA"`), it prematurely closes the marker comment in the HTML. The bot's next run won't find its existing comment and will fall back to the legacy substring detector — which works for single-job setups but degrades multi-job safety. Two CLA jobs in the same workflow file would start stomping each other's comments again.

Workaround: drop `-->` from the workflow `name:` — `Build &amp; Test then Sign` works.

If this affects you (the workflow name change isn't acceptable for organizational reasons, or you specifically need multi-job marker isolation), [open an issue](https://github.com/badideasforsale/cla-github-action/issues/new) or +1 an existing one. The action will sanitize the slug in a future patch if there's real demand.

## Contributors

<!-- readme: collaborators,contributors -start -->
<table>
<tr>
    <td align="center">
        <a href="https://github.com/badideasforsale">
            <img src="https://avatars.githubusercontent.com/u/80412585?v=4" width="100;" alt="badideasforsale"/>
            <br />
            <sub><b>Null</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/ibakshay">
            <img src="https://avatars.githubusercontent.com/u/33329946?v=4" width="100;" alt="ibakshay"/>
            <br />
            <sub><b>Akshay Iyyadurai Balasundaram</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/michael-spengler">
            <img src="https://avatars.githubusercontent.com/u/43786652?v=4" width="100;" alt="michael-spengler"/>
            <br />
            <sub><b>Michael Spengler</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/AnandChowdhary">
            <img src="https://avatars.githubusercontent.com/u/2841780?v=4" width="100;" alt="AnandChowdhary"/>
            <br />
            <sub><b>Anand Chowdhary</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/kingthorin">
            <img src="https://avatars.githubusercontent.com/u/7570458?v=4" width="100;" alt="kingthorin"/>
            <br />
            <sub><b>Rick M</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/Writhe">
            <img src="https://avatars.githubusercontent.com/u/2022097?v=4" width="100;" alt="Writhe"/>
            <br />
            <sub><b>Filip Moroz</b></sub>
        </a>
    </td></tr>
<tr>
    <td align="center">
        <a href="https://github.com/mmv08">
            <img src="https://avatars.githubusercontent.com/u/16622558?v=4" width="100;" alt="mmv08"/>
            <br />
            <sub><b>Mikhail</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/manifestinteractive">
            <img src="https://avatars.githubusercontent.com/u/508411?v=4" width="100;" alt="manifestinteractive"/>
            <br />
            <sub><b>Peter Schmalfeldt</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/mattrosno">
            <img src="https://avatars.githubusercontent.com/u/1691245?v=4" width="100;" alt="mattrosno"/>
            <br />
            <sub><b>Matt Rosno</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/Or-Geva">
            <img src="https://avatars.githubusercontent.com/u/9606235?v=4" width="100;" alt="Or-Geva"/>
            <br />
            <sub><b>Or Geva</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/pellared">
            <img src="https://avatars.githubusercontent.com/u/5067549?v=4" width="100;" alt="pellared"/>
            <br />
            <sub><b>Robert Pająk</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/ScottBrenner">
            <img src="https://avatars.githubusercontent.com/u/416477?v=4" width="100;" alt="ScottBrenner"/>
            <br />
            <sub><b>Scott Brenner</b></sub>
        </a>
    </td></tr>
<tr>
    <td align="center">
        <a href="https://github.com/silviogutierrez">
            <img src="https://avatars.githubusercontent.com/u/92824?v=4" width="100;" alt="silviogutierrez"/>
            <br />
            <sub><b>Silvio</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/azzamsa">
            <img src="https://avatars.githubusercontent.com/u/17734314?v=4" width="100;" alt="azzamsa"/>
            <br />
            <sub><b>Azzam S.A</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/Tropicao">
            <img src="https://avatars.githubusercontent.com/u/4692087?v=4" width="100;" alt="Tropicao"/>
            <br />
            <sub><b>Alexis Lothoré</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/alohr51">
            <img src="https://avatars.githubusercontent.com/u/3623618?v=4" width="100;" alt="alohr51"/>
            <br />
            <sub><b>Andrew Lohr</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/aymanbagabas">
            <img src="https://avatars.githubusercontent.com/u/3187948?v=4" width="100;" alt="aymanbagabas"/>
            <br />
            <sub><b>Ayman Bagabas</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/fishcharlie">
            <img src="https://avatars.githubusercontent.com/u/860375?v=4" width="100;" alt="fishcharlie"/>
            <br />
            <sub><b>Charlie Fish</b></sub>
        </a>
    </td></tr>
<tr>
    <td align="center">
        <a href="https://github.com/darrellwarde">
            <img src="https://avatars.githubusercontent.com/u/8117355?v=4" width="100;" alt="darrellwarde"/>
            <br />
            <sub><b>Darrell Warde</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/Holzhaus">
            <img src="https://avatars.githubusercontent.com/u/1834516?v=4" width="100;" alt="Holzhaus"/>
            <br />
            <sub><b>Jan Holthuis</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/nwalters512">
            <img src="https://avatars.githubusercontent.com/u/1476544?v=4" width="100;" alt="nwalters512"/>
            <br />
            <sub><b>Nathan Walters</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/rokups">
            <img src="https://avatars.githubusercontent.com/u/19151258?v=4" width="100;" alt="rokups"/>
            <br />
            <sub><b>Rokas Kupstys</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/shunkakinoki">
            <img src="https://avatars.githubusercontent.com/u/39187513?v=4" width="100;" alt="shunkakinoki"/>
            <br />
            <sub><b>Shun Kakinoki</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/simonmeggle">
            <img src="https://avatars.githubusercontent.com/u/1897410?v=4" width="100;" alt="simonmeggle"/>
            <br />
            <sub><b>Simon Meggle</b></sub>
        </a>
    </td></tr>
<tr>
    <td align="center">
        <a href="https://github.com/t8">
            <img src="https://avatars.githubusercontent.com/u/20846869?v=4" width="100;" alt="t8"/>
            <br />
            <sub><b>Tate Berenbaum</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/Krinkle">
            <img src="https://avatars.githubusercontent.com/u/156867?v=4" width="100;" alt="Krinkle"/>
            <br />
            <sub><b>Timo Tijhof</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/AndrewGable">
            <img src="https://avatars.githubusercontent.com/u/2838819?v=4" width="100;" alt="AndrewGable"/>
            <br />
            <sub><b>Andrew Gable</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/knanao">
            <img src="https://avatars.githubusercontent.com/u/50069775?v=4" width="100;" alt="knanao"/>
            <br />
            <sub><b>Knanao</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/tada5hi">
            <img src="https://avatars.githubusercontent.com/u/13162758?v=4" width="100;" alt="tada5hi"/>
            <br />
            <sub><b>Peter</b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/wh201906">
            <img src="https://avatars.githubusercontent.com/u/62299611?v=4" width="100;" alt="wh201906"/>
            <br />
            <sub><b>Self Not Found</b></sub>
        </a>
    </td></tr>
<tr>
    <td align="center">
        <a href="https://github.com/woxiwangshunlibiye">
            <img src="https://avatars.githubusercontent.com/u/106640041?v=4" width="100;" alt="woxiwangshunlibiye"/>
            <br />
            <sub><b>Woyaoshunlibiye </b></sub>
        </a>
    </td>
    <td align="center">
        <a href="https://github.com/yahavi">
            <img src="https://avatars.githubusercontent.com/u/11367982?v=4" width="100;" alt="yahavi"/>
            <br />
            <sub><b>Yahav Itzhak</b></sub>
        </a>
    </td></tr>
</table>
<!-- readme: collaborators,contributors -end -->

## License

Contributor License Agreement assistant

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
