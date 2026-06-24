import { context } from '@actions/github'
import * as core from '@actions/core'

import { ReactedCommitterMap } from '../interfaces'
import { getStorageOctokit } from '../octokit'

import * as input from '../shared/getInputs'
import { buildCommitMessage } from '../shared/substituteCommitMessage'
import { getPullRequestNumber } from '../shared/getPullRequestNumber'

/**
 * Resolve the optional bot identity for signature commits.
 *
 * Returns `{name, email}` when both inputs are set, `undefined` when neither
 * is set, and `undefined` + a warning when only one is set (avoid producing
 * commits with half the identity overridden — that's almost certainly a
 * misconfiguration on the consumer's side).
 *
 * When undefined, the API uses the token's own identity:
 *   - App auth: `<app-name>[bot]`
 *   - PAT: the human who created the token
 *   - GITHUB_TOKEN: `github-actions[bot]`
 */
function botIdentity(): { name: string; email: string } | undefined {
  const name = input.getBotName()
  const email = input.getBotEmail()
  if (!name && !email) return undefined
  if (!name || !email) {
    core.warning(
      'bot-name and bot-email must both be set to override the commit identity; falling back to the token default.'
    )
    return undefined
  }
  return { name, email }
}

export async function getFileContent(): Promise<any> {
  const octokit = await getStorageOctokit({
    isCrossRepo: isRemoteRepoOrOrgConfigured()
  })

  const result = await octokit.rest.repos.getContent({
    owner: input.getRemoteOrgName() || context.repo.owner,
    repo: input.getRemoteRepoName() || context.repo.repo,
    path: input.getPathToSignatures(),
    ref: input.getBranch()
  })
  return result
}

export async function createFile(contentBinary): Promise<any> {
  const octokit = await getStorageOctokit({
    isCrossRepo: isRemoteRepoOrOrgConfigured()
  })
  const identity = botIdentity()

  return octokit.rest.repos.createOrUpdateFileContents({
    owner: input.getRemoteOrgName() || context.repo.owner,
    repo: input.getRemoteRepoName() || context.repo.repo,
    path: input.getPathToSignatures(),
    message:
      input.getCreateFileCommitMessage() ||
      'Creating file for storing CLA Signatures',
    content: contentBinary,
    branch: input.getBranch(),
    ...(identity ? { author: identity, committer: identity } : {})
  })
}

export async function updateFile(
  sha: string,
  claFileContent,
  reactedCommitters: ReactedCommitterMap
): Promise<any> {
  const octokit = await getStorageOctokit({
    isCrossRepo: isRemoteRepoOrOrgConfigured()
  })

  const pullRequestNo = getPullRequestNumber()
  const owner = context.issue.owner
  const repo = context.issue.repo

  if (claFileContent && !Array.isArray(claFileContent.signedContributors)) {
    claFileContent.signedContributors = []
  }
  // Dedup against existing ids — without this, signing twice from the same PR
  // creates duplicate entries in cla.json.
  const existingIds = new Set<number>(
    (claFileContent?.signedContributors ?? []).map(c => c.id)
  )
  const toAdd = reactedCommitters.newSigned.filter(c => !existingIds.has(c.id))
  claFileContent?.signedContributors.push(...toAdd)
  let contentString = JSON.stringify(claFileContent, null, 2)
  let contentBinary = Buffer.from(contentString).toString('base64')
  const identity = botIdentity()
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: input.getRemoteOrgName() || context.repo.owner,
    repo: input.getRemoteRepoName() || context.repo.repo,
    path: input.getPathToSignatures(),
    sha,
    message: buildCommitMessage(input.getSignedCommitMessage(), {
      contributorName: context.actor,
      pullRequestNo,
      owner,
      repo
    }),
    content: contentBinary,
    branch: input.getBranch(),
    ...(identity ? { author: identity, committer: identity } : {})
  })
}

function isRemoteRepoOrOrgConfigured(): boolean {
  const repo = input.getRemoteRepoName()
  const org = input.getRemoteOrgName()
  // SF-8: setting one without the other silently falls back per-field
  // (`getRemoteOrgName() || context.repo.owner`), so the action ends up
  // writing to a path the consumer didn't intend — e.g. `acme-org/<this-PR's-repo-name>`
  // when only `remote-organization-name: acme-org` was set. Warn loudly.
  if (Boolean(repo) !== Boolean(org)) {
    const set = repo ? 'remote-repository-name' : 'remote-organization-name'
    const missing = repo ? 'remote-organization-name' : 'remote-repository-name'
    core.warning(
      `Cross-repo signatures: only "${set}" is set; "${missing}" is required to complete the cross-repo configuration. ` +
      `Falling back to the PR's own repo for the missing field — this is probably not what you wanted. Set both inputs together.`
    )
  }
  return Boolean(repo || org)
}
