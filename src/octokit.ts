import { context, getOctokit as createOctokitClient } from '@actions/github'
import { createAppAuth } from '@octokit/auth-app'
import * as core from '@actions/core'

import * as input from './shared/getInputs'

type OctokitInstance = ReturnType<typeof createOctokitClient>

// Module-level caches. The App-installation token mint is a network call;
// caching means we do it at most once per action run.
let primaryCache: OctokitInstance | undefined
let storageCache: OctokitInstance | undefined
let appOctokitMemo: OctokitInstance | null | undefined

/**
 * Reset the module-level client caches. Test-only — production code should
 * never need this.
 */
export function _resetOctokitCacheForTests(): void {
  primaryCache = undefined
  storageCache = undefined
  appOctokitMemo = undefined
}

/**
 * The Octokit used for PR-side operations: graphql committer lookup,
 * issue/PR comments, PR lock, workflow re-run, org-member lookup.
 *
 * Auth precedence: App > GITHUB_TOKEN.
 * (No PAT here — PAT is only relevant for cross-repo storage.)
 */
export async function getOctokit(): Promise<OctokitInstance> {
  if (primaryCache) return primaryCache
  const app = await tryAppOctokit()
  if (app) {
    primaryCache = app
    return primaryCache
  }
  primaryCache = createOctokitClient(requireGithubToken())
  return primaryCache
}

/**
 * The Octokit used for reading/writing the signatures storage file. Differs
 * from the primary client only when the signatures are stored in a remote
 * repository — the default `GITHUB_TOKEN` is scoped to the current repo
 * and cannot write to another, so we fall over to a PAT.
 *
 * Auth precedence:
 *   1. App (if configured) — assumes the App is installed on the storage
 *      repo too. Documented limitation: cross-org storage requires the
 *      App installed in both orgs and the installation id pinned via the
 *      input.
 *   2. PAT (if cross-repo AND PAT set)
 *   3. GITHUB_TOKEN
 */
export async function getStorageOctokit(args: {
  isCrossRepo: boolean
}): Promise<OctokitInstance> {
  if (storageCache) return storageCache
  const app = await tryAppOctokit()
  if (app) {
    storageCache = app
    return storageCache
  }
  if (args.isCrossRepo && isPersonalAccessTokenPresent()) {
    storageCache = createOctokitClient(requirePersonalAccessToken())
  } else {
    storageCache = createOctokitClient(requireGithubToken())
  }
  return storageCache
}

export function isPersonalAccessTokenPresent(): boolean {
  const t = process.env.PERSONAL_ACCESS_TOKEN
  return t !== undefined && t !== ''
}

/**
 * Returns an App-installation Octokit when both `github-app-id` input AND
 * the `GITHUB_APP_PRIVATE_KEY` env var are set; otherwise null.
 *
 * The installation id is taken from `github-app-installation-id` input when
 * present (saves an API call); otherwise auto-discovered via
 * `apps.getRepoInstallation` for the workflow's repo.
 *
 * Memoized: on success, the same App Octokit serves both primary and storage
 * needs for the rest of the run.
 *
 * On any failure (App not configured, App not installed on this repo, bad
 * private key, network error), returns null. The caller then falls back to
 * PAT / GITHUB_TOKEN and the run continues. Failure is logged as a warning,
 * never as a setFailed — App config issues shouldn't break a workflow that
 * could otherwise succeed with the default token.
 */
async function tryAppOctokit(): Promise<OctokitInstance | null> {
  if (appOctokitMemo !== undefined) return appOctokitMemo

  const appId = input.getGitHubAppId()
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !privateKey) {
    appOctokitMemo = null
    return null
  }

  let installationId: number | undefined
  const idInput = input.getGitHubAppInstallationId()
  if (idInput) {
    const parsed = parseInt(idInput, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      installationId = parsed
    } else {
      core.warning(
        `Invalid github-app-installation-id "${idInput}"; falling back to auto-discovery.`
      )
    }
  }

  if (installationId === undefined) {
    // Auto-discover for this repo. Costs one extra API call (~200ms) on
    // every run — consumers can avoid by passing github-app-installation-id.
    try {
      const appOnly = createOctokitClient('', {
        authStrategy: createAppAuth,
        auth: { appId, privateKey }
      })
      const { data } = await appOnly.rest.apps.getRepoInstallation({
        owner: context.repo.owner,
        repo: context.repo.repo
      })
      installationId = data.id
      core.info(
        `GitHub App ${appId}: discovered installation id ${installationId} for ${context.repo.owner}/${context.repo.repo}`
      )
    } catch (err: any) {
      core.warning(
        `GitHub App ${appId} is not installed on ${context.repo.owner}/${context.repo.repo}, ` +
          `or the private key is invalid. Falling back to GITHUB_TOKEN / PERSONAL_ACCESS_TOKEN. ` +
          `Install at https://github.com/apps/<slug>/installations/new, or set ` +
          `github-app-installation-id explicitly to skip discovery. (${err?.message || err})`
      )
      appOctokitMemo = null
      return null
    }
  }

  appOctokitMemo = createOctokitClient('', {
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId }
  })
  return appOctokitMemo
}

function requireGithubToken(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) {
    throw new Error(
      'GITHUB_TOKEN env var is required when not using GitHub App auth. The GitHub Actions runner normally sets this automatically; ensure your workflow yaml passes `env.GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.'
    )
  }
  return t
}

function requirePersonalAccessToken(): string {
  const t = process.env.PERSONAL_ACCESS_TOKEN
  if (!t) {
    throw new Error(
      'PERSONAL_ACCESS_TOKEN env var is required for cross-repo signatures storage when not using GitHub App auth.'
    )
  }
  return t
}
