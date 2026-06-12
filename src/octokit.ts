import { getOctokit as createOctokitClient } from '@actions/github'

type OctokitInstance = ReturnType<typeof createOctokitClient>

// Module-level caches so repeated calls in one run don't redundantly mint
// clients (this matters once App auth lands in M5.2b — App-token minting is
// a network call and we should do it at most once per kind).
let primaryCache: OctokitInstance | undefined
let storageCache: OctokitInstance | undefined

/**
 * Reset the module-level client caches. Test-only — production code should
 * never need this. Marked underscored to discourage accidental use.
 */
export function _resetOctokitCacheForTests(): void {
  primaryCache = undefined
  storageCache = undefined
}

/**
 * The Octokit used for PR-side operations: graphql committer lookup,
 * issue/PR comments, PR lock, workflow re-run, org-member lookup.
 *
 * Today: `GITHUB_TOKEN`-backed client.
 * M5.2b: when App credentials are configured, App-installation token wins.
 */
export async function getOctokit(): Promise<OctokitInstance> {
  if (primaryCache) return primaryCache
  primaryCache = createOctokitClient(requireGithubToken())
  return primaryCache
}

/**
 * The Octokit used for reading/writing the signatures storage file. Differs
 * from the primary client only when the signatures are stored in a remote
 * repository — the default `GITHUB_TOKEN` is scoped to the current repo
 * and cannot write to another, so we fall over to a Personal Access Token.
 *
 * Today: PAT when cross-repo + PAT is set; else `GITHUB_TOKEN`.
 * M5.2b: when App credentials are configured, App-installation token wins
 *        (assumes the App is installed on the remote signatures repo too).
 */
export async function getStorageOctokit(args: {
  isCrossRepo: boolean
}): Promise<OctokitInstance> {
  if (storageCache) return storageCache
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

function requireGithubToken(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) {
    throw new Error(
      'GITHUB_TOKEN env var is required. The GitHub Actions runner normally sets this automatically; ensure your workflow yaml passes `env.GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.'
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
