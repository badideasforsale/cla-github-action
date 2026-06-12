![build](https://github.com/cla-assistant/github-action/workflows/build/badge.svg)


> [!NOTE]
> **This is a maintained fork** of [contributor-assistant/github-action](https://github.com/contributor-assistant/github-action), which was archived by its upstream maintainer in 2026. This fork picks up where upstream left off — see [`CHANGELOG.md`](./CHANGELOG.md) for changes.
>
> Consumers on `contributor-assistant/github-action@v2.x` can switch the tag to this fork's `@v3` once it ships; a migration guide will accompany the v3 release.

# Handling CLAs and DCOs via GitHub Action

Streamline your workflow and let this GitHub Action (a lite version of [CLA Assistant](https://github.com/cla-assistant/cla-assistant)) handle the legal side of contributions to a repository for you. CLA assistant GitHub action enables contributors to sign CLAs from within a pull request. With this GitHub Action we could get rid of the need for a centrally managed database by **storing the contributor's signature data** in a decentralized way - **in the same repository's file system** or **in a remote repository** which can be even a private repository.

### Features
1. decentralized data storage
1. fully integrated within github environment
1. no User Interface is required
1. contributors can sign the CLA or DCO by just posting a Pull Request comment
1. signatures will be stored in a file inside the repository or in a remote repository
1. signatures can also be stored inside a private repository
1. versioning of signatures

## Configure Contributor License Agreement within two minutes

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
        uses: contributor-assistant/github-action@v2.6.1
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
          allowlist: user1,bot*

         # the followings are the optional inputs - If the optional inputs are not given, then default values will be taken
          #remote-organization-name: enter the remote organization name where the signatures should be stored (Default is storing the signatures in the same repository)
          #remote-repository-name: enter the  remote repository name where the signatures should be stored (Default is storing the signatures in the same repository)
          #create-file-commit-message: 'For example: Creating file for storing CLA Signatures'
          #signed-commit-message: 'For example: $contributorName has signed the CLA in $owner/$repo#$pullRequestNo'
          #custom-notsigned-prcomment: 'pull request comment with Introductory message to ask new contributors to sign'
          #custom-pr-sign-comment: 'The signature to be committed in order to sign the CLA'
          #custom-allsigned-prcomment: 'pull request comment when all contributors has signed, defaults to **CLA Assistant Lite bot** All Contributors have signed the CLA.'
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

#### 5. Users and bots in allowlist

If a GitHub username is included in the allowlist, they will not be required to sign a CLA. You can make use of this feature If you don't want your colleagues working in the same team/organisation to sign a CLA. And also, since there's no way for bot users (such as Dependabot or Greenkeeper) to sign a CLA, you may want to add them in `allowlist`. You can do so by adding their names in a comma separated string to the `allowlist` input in the CLA  workflow file(in this case `dependabot[bot],greenkeeper[bot]`). You can also use wildcard symbol in case you want to allow all bot users something like `bot*`.

##### Demo for step 5

![allowlist](https://github.com/cla-assistant/github-action/blob/master/images/allowlist.gif?raw=true)

#### 6. Authentication

The action needs a token to read PR data, post comments, and write the signatures file. There are three options, listed best-to-worst.

##### 6a. GitHub App (recommended)

A dedicated GitHub App with bot identity, short-lived 1-hour tokens, no human ownership. Best for production, best for org-wide rollouts, best for cross-repo signatures storage. Two inputs + one env var:

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

### Environmental Variables:


| Name                  | Requirement | Description |
| --------------------- | ----------- | ----------- |
| `GITHUB_TOKEN`        | _required_ (unless using App) | Usage: `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. The runner's auto-provisioned token. Built into GitHub Actions; does not need to be manually created. [More info](https://help.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token). |
| `GITHUB_APP_PRIVATE_KEY` | _required_ for App auth | Usage: `GITHUB_APP_PRIVATE_KEY: ${{ secrets.CLA_APP_PRIVATE_KEY }}`. The PEM contents of the App's private key. Env var rather than action input because PEM blobs are multi-line. |
| `PERSONAL_ACCESS_TOKEN` | _required_ for cross-repo storage without App | Usage: `PERSONAL_ACCESS_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}`. [PAT](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) with `repo` scope (and `read:org` if using `exempt-repo-org-members`). |

### Inputs Description:

| Name                  | Requirement | Description | Example |
| --------------------- | ----------- | ----------- | ------- |
| `path-to-document`     | _required_ |  provide full URL `https://<clafile>` to the document which shall be signed by the contributor(s)  It can be any file e.g. inside the repository or it can be a gist. | https://github.com/cla-assistant/github-action/blob/master/SAPCLA.md |
| `path-to-signatures`       | _optional_ |  Path to the JSON file where  all the signatures of the contributors will be stored inside the repository. | signatures/version1/cla.json |
| `branch`   | _optional_ |  Branch in which all the signatures of the contributors will be stored and Default branch is `master`.  | master |
| `allowlist`   | _optional_ | You can specify users and bots to be [added in allowlist](https://github.com/cla-assistant/github-action#5-users-and-bots-in-allowlist).  | user1,user2,bot* |
| `remote-repository-name`   | _optional_ | provide the remote repository name where all the signatures should be stored . | remote repository name |
| `remote-organization-name`   | _optional_ | provide the remote organization name where all the signatures should be stored. | remote organization name |
| `create-file-commit-message`   | _optional_ |Commit message when a new CLA file is created. | Creating file for storing CLA Signatures. |
| `signed-commit-message`   | _optional_ | Commit message when a new contributor signs the CLA in a Pull Request. |  $contributorName has signed the CLA in $pullRequestNo |
| `custom-notsigned-prcomment`   | _optional_ | Introductory Pull Request comment to ask new contributors to sign. | Thank you for your contribution and please kindly read and sign our $pathToCLADocument |
| `custom-pr-sign-comment`   | _optional_ | The signature to be committed in order to sign the CLA. | I have read the Developer Terms Document and I hereby accept the Terms |
| `custom-allsigned-prcomment`   | _optional_ | pull request comment when everyone has signed | All Contributors have signed the CLA. |
| `lock-pullrequest-aftermerge`   | _optional_ | Boolean input for locking the pull request after merging. Default is set to `true`.  It is highly recommended to lock the Pull Request after merging so that the Contributors won't be able to revoke their signature comments after merge | false |
| `suggest-recheck`   | _optional_ | Boolean input for indicating if the action's comment should suggest that users comment `recheck`. Default is set to `true`. | false |

## Contributors

<!-- readme: collaborators,contributors -start -->
<table>
<tr>
    <td align="center">
        <a href="https://github.com/matbos">
            <img src="https://avatars.githubusercontent.com/u/1948188?v=4" width="100;" alt="matbos"/>
            <br />
            <sub><b>Mateusz Boś</b></sub>
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
        <a href="https://github.com/ibakshay">
            <img src="https://avatars.githubusercontent.com/u/33329946?v=4" width="100;" alt="ibakshay"/>
            <br />
            <sub><b>Akshay Iyyadurai Balasundaram</b></sub>
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
