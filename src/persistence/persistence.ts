import { context } from '@actions/github'

import { ReactedCommitterMap } from '../interfaces'
import { getStorageOctokit } from '../octokit'

import * as input from '../shared/getInputs'
import { buildCommitMessage } from '../shared/substituteCommitMessage'
import { getPullRequestNumber } from '../shared/getPullRequestNumber'

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

  return octokit.rest.repos.createOrUpdateFileContents({
    owner: input.getRemoteOrgName() || context.repo.owner,
    repo: input.getRemoteRepoName() || context.repo.repo,
    path: input.getPathToSignatures(),
    message:
      input.getCreateFileCommitMessage() ||
      'Creating file for storing CLA Signatures',
    content: contentBinary,
    branch: input.getBranch()
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
    branch: input.getBranch()
  })
}

function isRemoteRepoOrOrgConfigured(): boolean {
  return Boolean(input.getRemoteRepoName() || input.getRemoteOrgName())
}
